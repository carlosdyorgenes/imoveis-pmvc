import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma'
import { gerarTextoIA, gerarViaAnthropicComArquivo } from './ia'
import { classificarArquivo, mimeDaImagem, trechosNovos, AnexoParaPrompt } from '../domain/anexos'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (b: Buffer, o?: { max?: number }) => Promise<{ text: string; numpages: number }> = require('pdf-parse/lib/pdf-parse.js')

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'documentos')

// O servidor tem pouca memória: arquivos grandes são ignorados e a fila processa um por vez.
const LIMITE_ARQUIVO_BYTES = 20 * 1024 * 1024
const MAX_PAGINAS_IA = 40
const MAX_CHARS_TEXTO_GUARDADO = 300_000
const MAX_CHARS_PARA_IA = 60_000
const LIMIAR_RESUMO_CURTO = 1200
const MIN_CHARS_POR_PAGINA = 80
const MIN_CHARS_ACRESCIMO = 150
const MAX_CHARS_SECAO_PROMPT = 14_000

const SYSTEM_PROMPT_ANEXO = `Você resume documentos anexados a processos administrativos da Gerência de Patrimônio de uma prefeitura.
Produza um resumo objetivo e fiel, de 5 a 10 linhas, informando:
* o tipo do documento (ofício, parecer, certidão, memorial descritivo, planta, matrícula, laudo etc.);
* o assunto e a conclusão, decisão ou solicitação principal;
* os dados-chave que identificam o caso (números de matrícula/processo, áreas, localização, partes, valores, prazos) quando existirem.
Baseie-se SOMENTE no documento. Não invente, não opine, não copie trechos longos. Retorne apenas o resumo, sem título e sem Markdown.`

const SYSTEM_PROMPT_ANEXO_ATUALIZACAO = `Você recebe SOMENTE os trechos que foram acrescentados ou alterados em uma nova versão de um documento já anexado a um processo administrativo.
Resuma de 2 a 6 linhas apenas o que há de novo (o que foi incluído, corrigido ou complementado), sem repetir o que já constava na versão anterior.
Baseie-se SOMENTE no texto recebido. Não invente nem opine. Retorne apenas o resumo, sem título e sem Markdown.`

export interface ResultadoProcessamento {
  acao: 'JA_PROCESSADO' | 'SEM_ARQUIVO' | 'DUPLICADO' | 'IGNORADO' | 'TEXTO_SEM_IA' | 'TEXTO_COM_IA' | 'VISAO_IA' | 'ERRO'
  motivo?: string
  chamadasIA: number
}

async function extrairTextoLocal(buffer: Buffer, tipo: ReturnType<typeof classificarArquivo>): Promise<{ texto: string | null; paginas: number; precisaVisao: boolean }> {
  if (tipo === 'pdf') {
    try {
      const r = await pdfParse(buffer, { max: MAX_PAGINAS_IA })
      const limpo = r.text.replace(/\s+/g, ' ').trim()
      const paginasLidas = Math.max(1, Math.min(r.numpages, MAX_PAGINAS_IA))
      if (limpo.length / paginasLidas < MIN_CHARS_POR_PAGINA) return { texto: null, paginas: r.numpages, precisaVisao: true }
      return { texto: r.text, paginas: r.numpages, precisaVisao: false }
    } catch {
      return { texto: null, paginas: 0, precisaVisao: true }
    }
  }
  if (tipo === 'docx') {
    const r = await mammoth.extractRawText({ buffer })
    return { texto: r.value, paginas: 0, precisaVisao: false }
  }
  if (tipo === 'xlsx') {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const partes = wb.SheetNames.slice(0, 5).map(n => `Planilha ${n}:\n${XLSX.utils.sheet_to_csv(wb.Sheets[n]).split('\n').slice(0, 200).join('\n')}`)
    return { texto: partes.join('\n\n'), paginas: 0, precisaVisao: false }
  }
  if (tipo === 'texto') return { texto: buffer.toString('utf8'), paginas: 0, precisaVisao: false }
  return { texto: null, paginas: 0, precisaVisao: tipo === 'imagem' }
}

async function resumirTexto(texto: string, nome: string, atualizacao: boolean): Promise<string> {
  const limpo = texto.trim()
  if (limpo.length <= LIMIAR_RESUMO_CURTO) return limpo
  const { texto: resumo } = await gerarTextoIA(
    atualizacao ? SYSTEM_PROMPT_ANEXO_ATUALIZACAO : SYSTEM_PROMPT_ANEXO,
    `Documento: ${nome}\n\n${limpo.slice(0, MAX_CHARS_PARA_IA)}`,
  )
  return resumo
}

// Lê um arquivo anexado e grava (ou, em dryRun, apenas classifica) o conteúdo dele:
// - mesmo arquivo (hash) já anexado antes na mesma demanda → DUPLICADO, não é descrito de novo;
// - nova versão do mesmo documento (mesma atividade e nome) → resume só o que é novo;
// - PDF com texto, Word e Excel → texto extraído sem IA; escaneados e imagens → Claude (visão).
export async function processarAnexo(documentoId: string, opcoes: { dryRun?: boolean } = {}): Promise<ResultadoProcessamento> {
  const dry = !!opcoes.dryRun
  const doc = await prisma.documentoAtividade.findUnique({
    where: { id: documentoId },
    include: { atividade: { select: { demandaId: true } }, conteudo: true },
  })
  if (!doc || !doc.arquivoPath) return { acao: 'SEM_ARQUIVO', chamadasIA: 0 }
  const demandaId = doc.atividade.demandaId

  const salvar = async (dados: { status: string; tipoLeitura?: string | null; texto?: string | null; resumo?: string | null; duplicadoDeId?: string | null; versaoAnteriorId?: string | null; motivo?: string | null }, hash: string | null) => {
    if (dry) return
    const base = {
      demandaId, arquivoHash: hash, status: dados.status, tipoLeitura: dados.tipoLeitura ?? null, texto: dados.texto ?? null,
      resumo: dados.resumo ?? null, duplicadoDeId: dados.duplicadoDeId ?? null, versaoAnteriorId: dados.versaoAnteriorId ?? null, motivo: dados.motivo ?? null,
    }
    await prisma.conteudoAnexo.upsert({ where: { documentoId }, create: { documentoId, ...base }, update: base })
  }

  const caminho = path.join(UPLOADS_DIR, doc.arquivoPath)
  if (!fs.existsSync(caminho)) {
    await salvar({ status: 'ERRO', motivo: 'Arquivo não encontrado no armazenamento' }, doc.arquivoHash)
    return { acao: 'ERRO', motivo: 'arquivo não encontrado', chamadasIA: 0 }
  }

  const finais = ['LIDO', 'DUPLICADO', 'IGNORADO']
  if (doc.conteudo && finais.includes(doc.conteudo.status) && (!doc.arquivoHash || doc.conteudo.arquivoHash === doc.arquivoHash)) {
    return { acao: 'JA_PROCESSADO', chamadasIA: 0 }
  }

  const tamanho = fs.statSync(caminho).size
  if (tamanho > LIMITE_ARQUIVO_BYTES) {
    await salvar({ status: 'IGNORADO', motivo: `Arquivo maior que ${LIMITE_ARQUIVO_BYTES / 1024 / 1024} MB` }, doc.arquivoHash)
    return { acao: 'IGNORADO', motivo: 'arquivo muito grande', chamadasIA: 0 }
  }

  const tipo = classificarArquivo(doc.arquivoMime, doc.arquivoPath)
  if (tipo === 'outro') {
    await salvar({ status: 'IGNORADO', motivo: 'Formato não lido (compactado, DWG ou outro)' }, doc.arquivoHash)
    return { acao: 'IGNORADO', motivo: 'formato não lido', chamadasIA: 0 }
  }

  const buffer = fs.readFileSync(caminho)
  const hash = doc.arquivoHash ?? crypto.createHash('sha256').update(buffer).digest('hex')

  const original = await prisma.documentoAtividade.findFirst({
    where: {
      arquivoHash: hash, id: { not: doc.id }, atividade: { demandaId },
      OR: [{ createdAt: { lt: doc.createdAt } }, { createdAt: doc.createdAt, id: { lt: doc.id } }],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (original) {
    await salvar({ status: 'DUPLICADO', duplicadoDeId: original.id, motivo: 'Mesmo arquivo já anexado antes nesta demanda' }, hash)
    return { acao: 'DUPLICADO', chamadasIA: 0 }
  }

  let local
  try {
    local = await extrairTextoLocal(buffer, tipo)
  } catch (e) {
    await salvar({ status: 'ERRO', motivo: `Falha ao extrair texto: ${e instanceof Error ? e.message : 'erro desconhecido'}` }, hash)
    return { acao: 'ERRO', motivo: 'falha na extração', chamadasIA: 0 }
  }

  if (local.precisaVisao) {
    if (local.paginas > MAX_PAGINAS_IA) {
      await salvar({ status: 'IGNORADO', motivo: `Documento escaneado com ${local.paginas} páginas (limite de ${MAX_PAGINAS_IA})` }, hash)
      return { acao: 'IGNORADO', motivo: 'escaneado com muitas páginas', chamadasIA: 0 }
    }
    if (dry) return { acao: 'VISAO_IA', chamadasIA: 1 }
    try {
      const mime = tipo === 'pdf' ? 'application/pdf' : mimeDaImagem(doc.arquivoMime, doc.arquivoPath)
      const resumo = await gerarViaAnthropicComArquivo(SYSTEM_PROMPT_ANEXO, `Resuma este documento. Nome do anexo: ${doc.nome}`, { base64: buffer.toString('base64'), mime })
      await salvar({ status: 'LIDO', tipoLeitura: 'IA', resumo }, hash)
      return { acao: 'VISAO_IA', chamadasIA: 1 }
    } catch (e) {
      await salvar({ status: 'ERRO', motivo: e instanceof Error ? e.message : 'erro desconhecido na leitura por IA' }, hash)
      return { acao: 'ERRO', motivo: 'falha na leitura por IA', chamadasIA: 1 }
    }
  }

  const texto = (local.texto || '').trim()
  if (!texto) {
    await salvar({ status: 'IGNORADO', motivo: 'Sem texto extraível' }, hash)
    return { acao: 'IGNORADO', motivo: 'sem texto', chamadasIA: 0 }
  }
  const textoGuardado = texto.slice(0, MAX_CHARS_TEXTO_GUARDADO)

  const anterior = await prisma.documentoAtividade.findFirst({
    where: { atividadeId: doc.atividadeId, nome: doc.nome, versao: { lt: doc.versao }, arquivoPath: { not: null } },
    orderBy: { versao: 'desc' },
    include: { conteudo: true },
  })
  const textoAnterior = anterior?.conteudo?.status === 'LIDO' ? anterior.conteudo.texto : null

  let trecho = textoGuardado
  let atualizacao = false
  if (anterior && textoAnterior) {
    trecho = trechosNovos(textoAnterior, textoGuardado)
    atualizacao = true
  }

  if (atualizacao && trecho.length < MIN_CHARS_ACRESCIMO) {
    await salvar({ status: 'LIDO', tipoLeitura: 'TEXTO', texto: textoGuardado, resumo: '', versaoAnteriorId: anterior!.id, motivo: 'Sem acréscimos relevantes em relação à versão anterior' }, hash)
    return { acao: 'TEXTO_SEM_IA', motivo: 'versão sem acréscimos', chamadasIA: 0 }
  }

  const precisaIA = trecho.trim().length > LIMIAR_RESUMO_CURTO
  if (dry) return { acao: precisaIA ? 'TEXTO_COM_IA' : 'TEXTO_SEM_IA', chamadasIA: precisaIA ? 1 : 0 }

  try {
    const resumo = await resumirTexto(trecho, doc.nome, atualizacao)
    await salvar({ status: 'LIDO', tipoLeitura: 'TEXTO', texto: textoGuardado, resumo, versaoAnteriorId: atualizacao ? anterior!.id : null }, hash)
    return { acao: precisaIA ? 'TEXTO_COM_IA' : 'TEXTO_SEM_IA', chamadasIA: precisaIA ? 1 : 0 }
  } catch (e) {
    await salvar({ status: 'ERRO', motivo: e instanceof Error ? e.message : 'erro desconhecido ao resumir' }, hash)
    return { acao: 'ERRO', motivo: 'falha ao resumir', chamadasIA: 1 }
  }
}

// Fila em memória: a leitura de cada upload roda em segundo plano, um arquivo por vez (protege
// a memória do servidor) e nunca derruba a requisição de upload.
let fila: Promise<unknown> = Promise.resolve()
export function enfileirarProcessamentoAnexo(documentoId: string) {
  fila = fila
    .then(() => processarAnexo(documentoId))
    .catch(e => console.error('[anexos] falha ao processar', documentoId, e))
}

// Resumos dos anexos de uma demanda, prontos para entrar no prompt: sem duplicados, sem
// formatos não lidos, e com versões novas trazendo apenas o acréscimo.
export async function carregarAnexosParaPrompt(demandaId: string): Promise<AnexoParaPrompt[]> {
  const itens = await prisma.conteudoAnexo.findMany({
    where: { demandaId, status: 'LIDO' },
    include: { documento: { select: { nome: true, versao: true, createdAt: true, atividade: { select: { titulo: true, status: true } } } } },
  })
  const lista = itens
    .filter(i => (i.resumo || '').trim() && i.documento.atividade.status !== 'CANCELADA')
    .sort((a, b) => a.documento.createdAt.getTime() - b.documento.createdAt.getTime())
    .map(i => ({
      atividadeTitulo: i.documento.atividade.titulo,
      nome: i.documento.nome,
      versao: i.documento.versao,
      ehAtualizacao: !!i.versaoAnteriorId,
      resumo: (i.resumo as string).trim().slice(0, 1500),
    }))

  let total = 0
  const dentroDoLimite: AnexoParaPrompt[] = []
  for (const a of [...lista].reverse()) {
    total += a.resumo.length + a.nome.length + 80
    if (total > MAX_CHARS_SECAO_PROMPT) break
    dentroDoLimite.unshift(a)
  }
  return dentroDoLimite
}

export const REGRA_ANEXOS_PROMPT = `

DOCUMENTOS ANEXADOS
Quando o texto de entrada trouxer a seção "DOCUMENTOS ANEXADOS", ela contém o conteúdo já lido dos arquivos. Incorpore ao texto as informações relevantes desses documentos (o que o documento conclui, solicita, atesta ou comprova), sem copiá-los literalmente, sem repetir o que já consta nos demais registros e sem inventar o que não estiver neles. Quando um documento aparecer como ATUALIZAÇÃO, considere apenas o que foi acrescentado. Não cite nomes de arquivos nem a existência da seção.`
