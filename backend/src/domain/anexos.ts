export type TipoArquivo = 'pdf' | 'docx' | 'xlsx' | 'imagem' | 'texto' | 'outro'

const MIME_IMAGEM_SUPORTADO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Decide como ler um anexo. O mime nem sempre é confiável (há arquivos gravados como
// application/octet-stream), então a extensão do nome do arquivo desempata.
export function classificarArquivo(mime: string | null | undefined, nomeArquivo: string): TipoArquivo {
  const ext = (nomeArquivo.split('.').pop() || '').toLowerCase()
  const m = (mime || '').toLowerCase()
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (m.includes('wordprocessingml') || ext === 'docx') return 'docx'
  if (m.includes('spreadsheetml') || ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (MIME_IMAGEM_SUPORTADO.includes(m)) return 'imagem'
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'imagem'
  if (m === 'text/plain' || ext === 'txt') return 'texto'
  return 'outro'
}

export function mimeDaImagem(mime: string | null | undefined, nomeArquivo: string): string {
  const m = (mime || '').toLowerCase()
  if (MIME_IMAGEM_SUPORTADO.includes(m)) return m
  const ext = (nomeArquivo.split('.').pop() || '').toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function normalizarLinha(l: string): string {
  return l.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

const TAMANHO_MINIMO_LINHA = 20

// Isola o que há de novo numa versão atualizada do mesmo documento: devolve só as linhas do
// texto atual que não existiam (ignorando caixa, acento e pontuação) no texto anterior. Linhas
// curtas (numeração de página, cabeçalhos) são descartadas por não carregarem conteúdo.
export function trechosNovos(anterior: string, atual: string): string {
  const jaExistia = new Set(
    anterior.split(/\n+/).map(normalizarLinha).filter(l => l.length >= TAMANHO_MINIMO_LINHA),
  )
  const novas: string[] = []
  const vistas = new Set<string>()
  for (const linha of atual.split(/\n+/)) {
    const n = normalizarLinha(linha)
    if (n.length < TAMANHO_MINIMO_LINHA) continue
    if (jaExistia.has(n) || vistas.has(n)) continue
    vistas.add(n)
    novas.push(linha.trim())
  }
  return novas.join('\n')
}

export interface AnexoParaPrompt {
  atividadeTitulo: string
  nome: string
  versao: number
  ehAtualizacao: boolean
  resumo: string
}

// Monta a seção "documentos anexados" que entra no texto enviado à IA. Cada documento aparece
// uma única vez: duplicados (mesmo arquivo) nem chegam aqui, e uma nova versão traz só o que
// foi acrescentado em relação à anterior.
export function formatarSecaoAnexos(anexos: AnexoParaPrompt[]): string {
  if (anexos.length === 0) return ''
  const linhas = ['DOCUMENTOS ANEXADOS (conteúdo lido dos arquivos):']
  for (const a of anexos) {
    const cab = a.ehAtualizacao
      ? `- [${a.atividadeTitulo}] "${a.nome}" — ATUALIZAÇÃO (v${a.versao}), somente o que foi acrescentado em relação à versão anterior:`
      : `- [${a.atividadeTitulo}] "${a.nome}"${a.versao > 1 ? ` (v${a.versao})` : ''}:`
    linhas.push(cab)
    linhas.push(a.resumo.split('\n').map(l => `  ${l}`).join('\n'))
  }
  return linhas.join('\n')
}
