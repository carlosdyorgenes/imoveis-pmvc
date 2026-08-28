import { Router, Response } from 'express'
import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { calcularTemposAtividade } from '../domain/tempos'
import { gerarTextoIA } from '../utils/ia'

export const relatoriosRouter = Router()
relatoriosRouter.use(authenticate)

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'brasao.png')
const LOGO_BUFFER = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ---- Imóveis PDF ----
relatoriosRouter.get('/imoveis/pdf', async (req: AuthRequest, res: Response) => {
  const { tipo, zona, secretaria } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}
  if (tipo) where.tipo = tipo
  if (zona) where.zona = zona
  if (secretaria) where.secretaria = { contains: secretaria, mode: 'insensitive' }

  const imoveis = await prisma.imovel.findMany({ where, include: { _count: { select: { ocorrencias: true } } }, orderBy: { createdAt: 'desc' } })

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_imoveis.pdf')
  doc.pipe(res)

  doc.fontSize(16).text('Relatório de Imóveis - PMVC', { align: 'center' })
  doc.fontSize(10).text(`Gerado em: ${formatDate(new Date())}`, { align: 'center' })
  doc.moveDown()

  imoveis.forEach((im, i) => {
    if (i > 0 && i % 4 === 0) doc.addPage()
    doc.fontSize(9)
      .text(`Inscrição: ${im.inscricaoImobiliaria} | ${im.tipo} | ${im.zona}`)
      .text(`Endereço: ${im.logradouro}, ${im.numero || 'S/N'} - ${im.bairro}, ${im.cidade}/${im.estado}`)
      .text(`Secretaria: ${im.secretaria} | Ocorrências: ${im._count.ocorrencias}`)
      .moveDown(0.3)
  })

  doc.end()
})

// ---- Imóveis Excel ----
relatoriosRouter.get('/imoveis/excel', async (req: AuthRequest, res: Response) => {
  const { tipo, zona, secretaria } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}
  if (tipo) where.tipo = tipo
  if (zona) where.zona = zona
  if (secretaria) where.secretaria = { contains: secretaria, mode: 'insensitive' }

  const imoveis = await prisma.imovel.findMany({ where, include: { _count: { select: { ocorrencias: true } } }, orderBy: { createdAt: 'desc' } })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Imóveis')
  ws.columns = [
    { header: 'Inscrição Imobiliária', key: 'inscricao', width: 22 },
    { header: 'Logradouro', key: 'logradouro', width: 30 },
    { header: 'Número', key: 'numero', width: 10 },
    { header: 'Bairro', key: 'bairro', width: 20 },
    { header: 'Cidade', key: 'cidade', width: 20 },
    { header: 'Estado', key: 'estado', width: 8 },
    { header: 'Secretaria', key: 'secretaria', width: 25 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Zona', key: 'zona', width: 12 },
    { header: 'Ocorrências', key: 'ocorrencias', width: 14 },
    { header: 'Cadastrado em', key: 'createdAt', width: 18 },
  ]
  ws.getRow(1).font = { bold: true }
  imoveis.forEach(im => {
    ws.addRow({
      inscricao: im.inscricaoImobiliaria,
      logradouro: im.logradouro,
      numero: im.numero,
      bairro: im.bairro,
      cidade: im.cidade,
      estado: im.estado,
      secretaria: im.secretaria,
      tipo: im.tipo,
      zona: im.zona,
      ocorrencias: im._count.ocorrencias,
      createdAt: formatDate(im.createdAt)
    })
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_imoveis.xlsx')
  await wb.xlsx.write(res)
})

// ---- Ocorrências PDF ----
relatoriosRouter.get('/ocorrencias/pdf', async (req: AuthRequest, res: Response) => {
  const { imovelId, from, to } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}
  if (imovelId) where.imovelId = imovelId
  if (from || to) {
    where.createdAt = {}
    if (from) (where.createdAt as Record<string, Date>).gte = new Date(from)
    if (to) (where.createdAt as Record<string, Date>).lte = new Date(to)
  }

  const ocorrencias = await prisma.ocorrencia.findMany({
    where,
    include: {
      user: { select: { name: true } },
      imovel: { select: { inscricaoImobiliaria: true, logradouro: true, bairro: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  const doc = new PDFDocument({ margin: 40 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_ocorrencias.pdf')
  doc.pipe(res)

  doc.fontSize(16).text('Relatório de Ocorrências - PMVC', { align: 'center' })
  doc.fontSize(10).text(`Gerado em: ${formatDate(new Date())} | Total: ${ocorrencias.length}`, { align: 'center' })
  doc.moveDown()

  ocorrencias.forEach(oc => {
    doc.fontSize(9)
      .text(`Data: ${formatDate(oc.createdAt)} | Usuário: ${oc.user.name} | Tipo: ${oc.tipo}`)
      .text(`Imóvel: ${oc.imovel.inscricaoImobiliaria} - ${oc.imovel.logradouro}, ${oc.imovel.bairro}`)
      .text(`Ocorrência: ${oc.descricao}`)
      .moveDown(0.5)
  })

  doc.end()
})

// ---- Ocorrências Excel ----
relatoriosRouter.get('/ocorrencias/excel', async (req: AuthRequest, res: Response) => {
  const { imovelId, from, to } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}
  if (imovelId) where.imovelId = imovelId
  if (from || to) {
    where.createdAt = {}
    if (from) (where.createdAt as Record<string, Date>).gte = new Date(from)
    if (to) (where.createdAt as Record<string, Date>).lte = new Date(to)
  }

  const ocorrencias = await prisma.ocorrencia.findMany({
    where,
    include: { user: { select: { name: true } }, imovel: { select: { inscricaoImobiliaria: true, logradouro: true, bairro: true } } },
    orderBy: { createdAt: 'desc' }
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Ocorrências')
  ws.columns = [
    { header: 'Data', key: 'data', width: 20 },
    { header: 'Inscrição', key: 'inscricao', width: 22 },
    { header: 'Endereço', key: 'endereco', width: 35 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Descrição', key: 'descricao', width: 50 },
    { header: 'Usuário', key: 'usuario', width: 20 },
  ]
  ws.getRow(1).font = { bold: true }
  ocorrencias.forEach(oc => {
    ws.addRow({
      data: formatDate(oc.createdAt),
      inscricao: oc.imovel.inscricaoImobiliaria,
      endereco: `${oc.imovel.logradouro}, ${oc.imovel.bairro}`,
      tipo: oc.tipo,
      descricao: oc.descricao,
      usuario: oc.user.name
    })
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_ocorrencias.xlsx')
  await wb.xlsx.write(res)
})

const TAREFAS_REPORT_INCLUDE = {
  etapas: {
    include: {
      cards: {
        include: {
          imovel: { select: { inscricaoImobiliaria: true, logradouro: true, bairro: true } },
          user: { select: { name: true } },
          passos: true,
        },
      },
    },
    orderBy: { ordem: 'asc' as const },
  },
}

// ---- Tarefas PDF ----
relatoriosRouter.get('/tarefas/pdf', async (req: AuthRequest, res: Response) => {
  const tarefas = await prisma.tarefa.findMany({
    include: TAREFAS_REPORT_INCLUDE,
    orderBy: { ordem: 'asc' }
  })

  const doc = new PDFDocument({ margin: 40 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_tarefas.pdf')
  doc.pipe(res)

  doc.fontSize(16).text('Relatório de Tarefas - PMVC', { align: 'center' })
  doc.fontSize(10).text(`Gerado em: ${formatDate(new Date())}`, { align: 'center' })
  doc.moveDown()

  tarefas.forEach(t => {
    const totalCards = t.etapas.reduce((acc, e) => acc + e.cards.length, 0)
    doc.fontSize(13).fillColor('#1e40af').text(`Tarefa: ${t.titulo} (${totalCards} imóvel(is))`)
    doc.fillColor('#000000')
    t.etapas.forEach(e => {
      doc.fontSize(11).fillColor('#374151').text(`  Etapa: ${e.titulo} (${e.cards.length})`)
      doc.fillColor('#000000')
      e.cards.forEach(c => {
        const concluidos = c.passos.filter(p => p.concluido).length
        const progresso = c.passos.length > 0 ? ` | Passos: ${concluidos}/${c.passos.length}` : ''
        doc.fontSize(9).text(`    • ${c.imovel.inscricaoImobiliaria} - ${c.imovel.logradouro}, ${c.imovel.bairro} | Resp: ${c.user.name}${progresso}`)
      })
    })
    doc.moveDown(0.5)
  })

  doc.end()
})

// ---- Tarefas Excel ----
relatoriosRouter.get('/tarefas/excel', async (req: AuthRequest, res: Response) => {
  const tarefas = await prisma.tarefa.findMany({
    include: TAREFAS_REPORT_INCLUDE,
    orderBy: { ordem: 'asc' }
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Tarefas')
  ws.columns = [
    { header: 'Tarefa', key: 'tarefa', width: 25 },
    { header: 'Etapa', key: 'etapa', width: 25 },
    { header: 'Inscrição', key: 'inscricao', width: 22 },
    { header: 'Endereço', key: 'endereco', width: 40 },
    { header: 'Responsável', key: 'responsavel', width: 20 },
    { header: 'Passos', key: 'passos', width: 12 },
    { header: 'Adicionado em', key: 'data', width: 20 },
    { header: 'Observações', key: 'obs', width: 30 },
  ]
  ws.getRow(1).font = { bold: true }
  tarefas.forEach(t => {
    t.etapas.forEach(e => {
      e.cards.forEach(c => {
        const concluidos = c.passos.filter(p => p.concluido).length
        ws.addRow({
          tarefa: t.titulo,
          etapa: e.titulo,
          inscricao: c.imovel.inscricaoImobiliaria,
          endereco: `${c.imovel.logradouro}, ${c.imovel.bairro}`,
          responsavel: c.user.name,
          passos: c.passos.length > 0 ? `${concluidos}/${c.passos.length}` : '-',
          data: formatDate(c.createdAt),
          obs: c.observacoes || ''
        })
      })
    })
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_tarefas.xlsx')
  await wb.xlsx.write(res)
})

// ---- Resumo geral PDF ----
relatoriosRouter.get('/resumo/pdf', async (req: AuthRequest, res: Response) => {
  const [totalImoveis, porTipo, porZona, totalOcorrencias, totalTarefas] = await Promise.all([
    prisma.imovel.count(),
    prisma.imovel.groupBy({ by: ['tipo'], _count: true }),
    prisma.imovel.groupBy({ by: ['zona'], _count: true }),
    prisma.ocorrencia.count(),
    prisma.tarefa.count(),
  ])

  const doc = new PDFDocument({ margin: 40 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_resumo.pdf')
  doc.pipe(res)

  doc.fontSize(18).text('Resumo Geral - PMVC', { align: 'center' })
  doc.fontSize(10).text(`Gerado em: ${formatDate(new Date())}`, { align: 'center' })
  doc.moveDown()

  doc.fontSize(14).text('Imóveis')
  doc.fontSize(11).text(`Total de Imóveis: ${totalImoveis}`)
  porTipo.forEach(g => doc.text(`  • ${g.tipo}: ${g._count}`))
  doc.moveDown(0.5)
  porZona.forEach(g => doc.text(`  • ${g.zona}: ${g._count}`))
  doc.moveDown()
  doc.fontSize(11).text(`Total de Ocorrências: ${totalOcorrencias}`)
  doc.text(`Total de Tarefas: ${totalTarefas}`)

  doc.end()
})

// ---- Demandas: dados comuns ----
const DEMANDAS_REPORT_INCLUDE = {
  solicitante: { select: { name: true } },
  atividades: {
    select: {
      titulo: true, status: true, prazo: true,
      responsavel: { select: { name: true } },
      equipe: { select: { nome: true } },
    },
  },
}

async function buscarDemandasRelatorio(query: Record<string, string>) {
  const where: Record<string, unknown> = {}
  if (query.status) where.status = query.status
  return prisma.demanda.findMany({ where, include: DEMANDAS_REPORT_INCLUDE, orderBy: { createdAt: 'desc' } })
}

const atrasada = (prazo: Date | null) => !!prazo && new Date(prazo) < new Date()

// ---- Demandas PDF ----
relatoriosRouter.get('/demandas/pdf', async (req: AuthRequest, res: Response) => {
  const demandas = await buscarDemandasRelatorio(req.query as Record<string, string>)

  const doc = new PDFDocument({ margin: 40 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_demandas.pdf')
  doc.pipe(res)

  doc.fontSize(16).text('Relatório de Demandas - PMVC', { align: 'center' })
  doc.fontSize(10).text(`Gerado em: ${formatDate(new Date())}`, { align: 'center' })
  doc.moveDown()

  demandas.forEach(d => {
    const atraso = atrasada(d.prazo)
    doc.fontSize(11).fillColor(atraso ? '#dc2626' : '#1e40af')
      .text(`GEP ${d.gepNumero}/${d.gepAno} — ${d.assunto}${atraso ? ' [ATRASADA]' : ''}`)
    doc.fillColor('#000000').fontSize(9)
      .text(`  Status: ${d.status} | Solicitante: ${d.solicitante.name}${d.prazo ? ` | Prazo: ${formatDate(d.prazo)}` : ''}`)
    d.atividades.forEach(a => {
      doc.text(`    • ${a.titulo} [${a.status}] — ${a.equipe ? `Equipe: ${a.equipe.nome}` : `Resp: ${a.responsavel?.name || '—'}`}`)
    })
    doc.moveDown(0.5)
  })

  doc.end()
})

// ---- Demandas Excel ----
relatoriosRouter.get('/demandas/excel', async (req: AuthRequest, res: Response) => {
  const demandas = await buscarDemandasRelatorio(req.query as Record<string, string>)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Demandas')
  ws.columns = [
    { header: 'GEP', key: 'gep', width: 16 },
    { header: 'Assunto', key: 'assunto', width: 35 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Solicitante', key: 'solicitante', width: 20 },
    { header: 'Prazo', key: 'prazo', width: 18 },
    { header: 'Atrasada', key: 'atrasada', width: 10 },
    { header: 'Atividades', key: 'atividades', width: 12 },
  ]
  ws.getRow(1).font = { bold: true }
  demandas.forEach(d => {
    ws.addRow({
      gep: `${d.gepNumero}/${d.gepAno}`,
      assunto: d.assunto,
      status: d.status,
      solicitante: d.solicitante.name,
      prazo: d.prazo ? formatDate(d.prazo) : '',
      atrasada: atrasada(d.prazo) ? 'SIM' : 'NÃO',
      atividades: d.atividades.length,
    })
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_demandas.xlsx')
  await wb.xlsx.write(res)
})

// ---- Demandas atrasadas (PDF) — atalho gerencial ----
relatoriosRouter.get('/demandas/atrasadas/pdf', async (req: AuthRequest, res: Response) => {
  const demandas = await prisma.demanda.findMany({
    where: { prazo: { lt: new Date() }, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } },
    include: DEMANDAS_REPORT_INCLUDE,
    orderBy: { prazo: 'asc' },
  })

  const doc = new PDFDocument({ margin: 40 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_demandas_atrasadas.pdf')
  doc.pipe(res)

  doc.fontSize(16).fillColor('#dc2626').text('Demandas Atrasadas - PMVC', { align: 'center' })
  doc.fillColor('#000000').fontSize(10).text(`Gerado em: ${formatDate(new Date())}`, { align: 'center' })
  doc.moveDown()

  if (demandas.length === 0) {
    doc.fontSize(12).text('Nenhuma demanda atrasada no momento.', { align: 'center' })
  }
  demandas.forEach(d => {
    doc.fontSize(11).text(`GEP ${d.gepNumero}/${d.gepAno} — ${d.assunto}`)
    doc.fontSize(9).text(`  Prazo vencido em: ${formatDate(d.prazo!)} | Status: ${d.status} | Solicitante: ${d.solicitante.name}`)
    doc.moveDown(0.3)
  })

  doc.end()
})

// ---- Indicadores gerenciais: tempo médio por área e carga por usuário (restrito ao MASTER) ----
// Mostra fluxo, carga e gargalos — deliberadamente NÃO monta ranking depreciativo de usuários
// (sem ordenação "pior desempenho", sem métrica de velocidade individual comparativa).
relatoriosRouter.get('/demandas/indicadores', requireMaster, async (_req: AuthRequest, res: Response) => {
  const atividades = await prisma.atividade.findMany({
    where: { status: { not: 'CANCELADA' } },
    include: {
      equipe: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
      transferencias: true,
    },
  })

  // Tempo médio de espera/execução por área (equipe) — só entra no cálculo quem já tem o dado.
  const porEquipe = new Map<string, { nome: string; somaEspera: number; somaExecucao: number; nEspera: number; nExecucao: number }>()
  for (const a of atividades) {
    const chave = a.equipe?.id || 'sem-equipe'
    const nome = a.equipe?.nome || 'Sem equipe'
    if (!porEquipe.has(chave)) porEquipe.set(chave, { nome, somaEspera: 0, somaExecucao: 0, nEspera: 0, nExecucao: 0 })
    const acc = porEquipe.get(chave)!
    const tempos = calcularTemposAtividade(a.createdAt, a.dataInicio, a.dataConclusao)
    if (a.dataInicio) { acc.somaEspera += tempos.tempoEspera.minutos; acc.nEspera++ }
    if (a.dataInicio && tempos.tempoExecucao) { acc.somaExecucao += tempos.tempoExecucao.minutos; acc.nExecucao++ }
  }
  const tempoMedioPorArea = [...porEquipe.values()].map(a => ({
    area: a.nome,
    tempoMedioEsperaMin: a.nEspera > 0 ? Math.round(a.somaEspera / a.nEspera) : null,
    tempoMedioExecucaoMin: a.nExecucao > 0 ? Math.round(a.somaExecucao / a.nExecucao) : null,
  }))

  // Carga atual por usuário — apenas contagem de tarefas ativas (não é métrica de desempenho).
  const cargaPorUsuario = new Map<string, { nome: string; ativas: number }>()
  for (const a of atividades) {
    if (!a.responsavel || !['ATRIBUIDA', 'EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO', 'REABERTA'].includes(a.status)) continue
    const chave = a.responsavel.id
    if (!cargaPorUsuario.has(chave)) cargaPorUsuario.set(chave, { nome: a.responsavel.name, ativas: 0 })
    cargaPorUsuario.get(chave)!.ativas++
  }

  const totalTransferidas = atividades.reduce((acc, a) => acc + a.transferencias.length, 0)
  const totalDevolvidas = await prisma.atividade.count({ where: { motivoDevolucao: { not: null } } })
  const totalConcluidas = await prisma.demanda.count({ where: { status: 'CONCLUIDA' } })
  const totalArquivadas = await prisma.demanda.count({ where: { status: 'CANCELADA' } })
  const totalSemMovimentacao = await prisma.demanda.count({
    where: { status: { notIn: ['CONCLUIDA', 'CANCELADA'] }, updatedAt: { lt: new Date(Date.now() - 15 * 86400000) } },
  })

  res.json({
    tempoMedioPorArea,
    cargaPorUsuario: [...cargaPorUsuario.values()],
    totalTransferidas,
    totalDevolvidas,
    totalConcluidas,
    totalArquivadas,
    totalSemMovimentacao,
  })
})

const SYSTEM_PROMPT_RELATORIO_GERAL = `Prompt — Análise da Situação Atual da Demanda por Atividade
Atue como analista administrativo especializado em acompanhamento de demandas, gestão de atividades e redação institucional.
Este prompt será executado individualmente para cada demanda cadastrada no sistema.
Sua função é consultar todas as informações disponíveis na demanda e, principalmente, analisar integralmente a atividade em questão para produzir um texto formal, objetivo e atualizado informando como essa demanda se encontra naquele momento.
O resultado deverá ser adequado para utilização direta em:

* acompanhamento administrativo;
* relatórios;
* consultas gerenciais;
* histórico da demanda;
* despachos;
* atualizações de situação.

1. FONTES DE INFORMAÇÃO
Analise integralmente todas as informações disponíveis na demanda e na atividade, especialmente:

* descrição da demanda;
* descrição da atividade;
* campo de observações;
* checklist;
* situação de cada item do checklist;
* pendência externa;
* descrição da pendência externa;
* movimentações registradas;
* documentos ou anexos mencionados;
* status atual da atividade;
* atividades anteriores relacionadas à mesma demanda;
* informações complementares registradas no sistema.

Não utilize apenas o status cadastrado.
O status deverá ser confrontado com o conteúdo efetivamente registrado nos campos da atividade.
2. OBJETIVO DA ANÁLISE
O texto final deverá permitir que uma pessoa que nunca acompanhou a demanda consiga compreender rapidamente:

1. o que está sendo tratado;
2. quais providências já foram realizadas;
3. o que ainda está em andamento;
4. quais itens permanecem pendentes;
5. se existe pendência externa;
6. de que providência depende a continuidade;
7. qual é a situação atual da atividade.

Não reproduza simplesmente os campos do sistema.
Interprete e consolide as informações.
3. ANÁLISE DO CAMPO DE OBSERVAÇÕES
O campo de observações deverá receber atenção especial.
Leia integralmente todas as informações registradas.
Identifique:

* providências solicitadas;
* providências realizadas;
* documentos produzidos;
* documentos recebidos;
* documentos encaminhados;
* análises realizadas;
* correções solicitadas;
* devoluções;
* respostas recebidas;
* complementações;
* dificuldades encontradas;
* providências ainda necessárias;
* informações que alterem a situação da atividade.

Não copie literalmente as observações quando puder consolidá-las.
Exemplo:
Se houver registros equivalentes a:
"Memorial solicitado."
"Memorial elaborado."
"Arquivo anexado."
Não escreva três acontecimentos separados.
Prefira:
"O memorial descritivo solicitado foi elaborado e anexado à atividade."
4. ANÁLISE DO CHECKLIST
Analise individualmente todos os itens existentes no checklist.
Considere:
ITEM CONCLUÍDO
Quando estiver expressamente marcado como concluído ou houver evidência clara no conteúdo da atividade de que a providência foi executada.
ITEM PENDENTE
Quando ainda não tiver sido executado.
ITEM EM ANDAMENTO
Quando houver registro de início da providência, mas sem confirmação de conclusão.
ITEM NÃO APLICÁVEL
Somente quando isso estiver indicado ou puder ser inequivocamente constatado pelos registros.
Não considere automaticamente um item concluído apenas porque existe uma observação relacionada a ele.
Verifique se a observação demonstra efetivamente sua conclusão.
5. PENDÊNCIA EXTERNA
Analise cuidadosamente o campo:
PENDÊNCIA EXTERNA.
Quando existir pendência externa, identifique:

* qual providência está sendo aguardada;
* qual documento está pendente;
* qual manifestação é necessária;
* qual retorno é necessário;
* se a atividade pode prosseguir antes desse retorno.

Não invente quem deverá executar a providência caso essa informação não esteja registrada.
Exemplos de situações:

* aguardando documentação;
* aguardando manifestação de outro setor;
* aguardando análise técnica;
* aguardando parecer;
* aguardando assinatura;
* aguardando retorno de órgão externo;
* aguardando correção documental;
* aguardando complementação de informações.

Quando a continuidade da demanda depender dessa pendência, isso deverá ficar claramente registrado no texto final.
6. CLASSIFICAÇÃO INTERNA DA SITUAÇÃO
Antes de escrever o texto, classifique internamente a atividade em uma das situações abaixo:
CONCLUÍDA
Todas as providências relevantes foram executadas e não existem pendências identificadas.
EM ANDAMENTO
Existem providências sendo executadas.
PENDENTE
Existem providências necessárias ainda não iniciadas ou não concluídas.
AGUARDANDO PROVIDÊNCIA EXTERNA
A continuidade depende de informação, documento, manifestação ou ação externa à atividade.
CONCLUÍDA COM PENDÊNCIA POSTERIOR
A atividade executou aquilo que lhe competia, mas a demanda ainda depende de outra providência.
NECESSITA CORREÇÃO
Foi realizada alguma providência, porém existe necessidade de ajuste, complementação ou correção.
SEM INFORMAÇÃO SUFICIENTE
Os registros existentes não permitem identificar com segurança a situação atual.
Essa classificação será utilizada apenas como apoio à análise.
Não apresente necessariamente o nome da classificação no texto final.
7. NÃO CONFUNDIR SOLICITAÇÃO COM CONCLUSÃO
Esta regra é fundamental.
Os seguintes registros NÃO significam conclusão:

* solicitado;
* encaminhado;
* enviado para análise;
* aguardando;
* solicitado ajuste;
* solicitado documento;
* pendente;
* encaminhado para correção;
* em elaboração.

Utilize verbos compatíveis com a situação real.
Exemplos:
Se foi solicitado:
"Foi solicitada a apresentação de..."
Se foi encaminhado:
"O documento foi encaminhado para análise..."
Se está em andamento:
"Encontra-se em andamento a elaboração de..."
Se foi concluído:
"Foi concluída a elaboração de..."
Se está pendente:
"Permanece pendente..."
Se existe dependência externa:
"A continuidade da demanda permanece condicionada ao recebimento de..."
8. CONFLITO ENTRE INFORMAÇÕES
Caso existam informações divergentes entre:

* observações;
* checklist;
* pendência externa;
* status;
* movimentações;

não escolha arbitrariamente.
Analise o conjunto dos registros e dê prioridade à informação que representar a situação efetivamente mais atual da atividade.
Exemplo:
Se o checklist ainda estiver marcado como pendente, mas a observação registrar claramente que a providência foi concluída e o documento correspondente foi anexado, considere essa evidência na análise.
Por outro lado, se a observação disser apenas que o documento foi solicitado, não considere o checklist concluído.
Quando não for possível resolver a divergência, utilize:
"Não foi possível identificar, pelos registros disponíveis, a conclusão definitiva dessa providência."
9. CONTEXTO DAS OUTRAS ATIVIDADES
Quando necessário para compreender a situação atual, consulte também as demais atividades vinculadas à mesma demanda.
Utilize-as apenas para:

* compreender o contexto;
* identificar providências anteriores;
* saber se determinado documento já foi produzido;
* verificar se uma pendência foi posteriormente solucionada;
* evitar afirmar como pendente algo já resolvido em outra atividade.

Entretanto, o texto final deverá continuar focado na situação da atividade analisada.
Não faça um histórico completo de todas as atividades da demanda.
10. EVITAR DUPLICIDADE
Caso a mesma informação apareça:

* nas observações;
* no checklist;
* na pendência externa;
* em outra movimentação;

mencione-a apenas uma vez.
Exemplo:
Se o checklist informa:
"Memorial descritivo — pendente"
e a observação informa:
"Aguardando recebimento do memorial descritivo."
Não escreva as duas informações separadamente.
Prefira:
"Permanece pendente o recebimento do memorial descritivo necessário à continuidade da demanda."
11. ABERTURA DO TEXTO
O texto deverá começar preferencialmente com:
"Considerando as informações registradas na demanda, especialmente nas observações, no checklist e nas pendências identificadas, verifica-se que..."
Adapte a continuação ao conteúdo real encontrado.
Não utilize uma abertura extensa.
12. DESENVOLVIMENTO
Após a abertura, apresente naturalmente:

1. breve contextualização do objeto da atividade;
2. principais providências realizadas;
3. resultados ou documentos obtidos;
4. providências ainda em andamento;
5. pendências existentes;
6. eventual dependência externa.

Não transforme o texto em uma lista.
Produza narrativa administrativa contínua.
13. SITUAÇÃO ATUAL
O último trecho deverá informar de maneira inequívoca como a atividade se encontra neste momento.
Utilize, conforme o caso:
"Atualmente, a atividade encontra-se em andamento, permanecendo pendente..."
"Atualmente, as providências registradas foram concluídas, não sendo identificadas pendências adicionais."
"Neste momento, a continuidade da demanda depende do recebimento de..."
"Atualmente, permanece pendente a conclusão de..."
"As providências internas registradas foram concluídas, permanecendo a demanda condicionada ao atendimento da pendência externa relacionada a..."
"A atividade necessita de complementação quanto a..."
"Não foi possível determinar a conclusão da atividade com base nas informações atualmente registradas."
Escolha somente a formulação compatível com os dados.
14. PENDÊNCIA EXTERNA E ATIVIDADE INTERNA CONCLUÍDA
Tenha atenção especial para esta situação.
Uma atividade poderá estar com todas as providências internas realizadas e, ainda assim, a demanda permanecer aguardando providência externa.
Nesse caso, NÃO informe simplesmente que:
"A demanda está concluída."
Prefira:
"As providências internas relacionadas à atividade foram concluídas, permanecendo a continuidade da demanda condicionada ao atendimento da pendência externa referente a [...]"
Essa distinção é obrigatória.
15. CHECKLIST PARCIALMENTE CONCLUÍDO
Quando existirem vários itens no checklist:

* não enumere todos se isso tornar o texto excessivamente longo;
* consolide os itens concluídos;
* destaque principalmente os que permanecem pendentes.

Exemplo:
"Parte das providências previstas no checklist já foi atendida, incluindo a análise documental e a elaboração do memorial, permanecendo pendentes a apresentação da planta atualizada e a documentação complementar necessária."
16. NÃO MENCIONAR DATAS
Não mencione datas no texto final.
As informações cronológicas poderão ser utilizadas internamente apenas para entender a ordem das movimentações.
Utilize expressões como:

* inicialmente;
* posteriormente;
* após análise;
* em seguida;
* atualmente;
* neste momento.

Somente quando necessário.
Não transforme o texto em uma linha do tempo.
17. NÃO MENCIONAR CAMPOS ADMINISTRATIVOS DESNECESSÁRIOS
Não inclua no texto:

* Interessado;
* Solicitante;
* Responsável.

Não utilize nomes de pessoas apenas para narrar quem realizou determinada ação.
O foco deve permanecer na demanda, na atividade e nas providências administrativas.
18. NÃO INVENTAR
É proibido:

* inventar providências;
* presumir conclusão;
* presumir pendências;
* criar documentos inexistentes;
* completar informações;
* inferir decisão que não esteja registrada;
* determinar próximo procedimento administrativo sem respaldo nos registros.

Quando a informação não existir, simplesmente não a inclua.
Quando a ausência impedir uma conclusão, declare isso objetivamente.
19. TAMANHO DO TEXTO
O texto deverá ser curto e proporcional à complexidade da atividade.
Atividade simples
1 parágrafo.
Atividade intermediária
1 a 2 parágrafos.
Atividade complexa
Máximo de 3 parágrafos.
Não produza relatório extenso.
A finalidade é permitir uma consulta rápida da situação atual.
20. ESTILO DE REDAÇÃO
Utilize:

* português do Brasil;
* linguagem formal administrativa;
* clareza;
* objetividade;
* coesão;
* precisão.

Evite:

* repetições;
* rodeios;
* linguagem excessivamente jurídica;
* palavras desnecessárias;
* opinião;
* julgamento;
* tom acusatório;
* explicações sobre o funcionamento do sistema.

O texto deverá parecer elaborado por um servidor após análise dos registros administrativos.
21. EXEMPLO DE RESULTADO
Exemplo apenas de estilo:
"Considerando as informações registradas na demanda, especialmente nas observações, no checklist e nas pendências identificadas, verifica-se que foram realizadas as análises documentais previstas e concluída a elaboração dos elementos técnicos disponíveis, com a respectiva inclusão dos documentos na atividade. Parte das providências previstas encontra-se atendida, permanecendo pendente a apresentação da documentação complementar necessária ao prosseguimento da análise.
Atualmente, as providências internas possíveis encontram-se realizadas, permanecendo a continuidade da demanda condicionada ao atendimento da pendência externa registrada."
NÃO copie esse conteúdo.
Utilize exclusivamente os dados da atividade real.
22. EXEMPLO — ATIVIDADE TOTALMENTE CONCLUÍDA
"Considerando as informações registradas na demanda, especialmente nas observações e no checklist, verifica-se que as providências previstas para a atividade foram devidamente executadas e os elementos necessários foram inseridos nos registros correspondentes. Atualmente, não foram identificadas pendências relacionadas à atividade, encontrando-se esta etapa concluída."
23. EXEMPLO — ATIVIDADE EM ANDAMENTO
"Considerando as informações registradas na demanda, especialmente nas observações e no checklist, verifica-se que parte das providências previstas já foi executada, permanecendo em andamento as atividades necessárias à complementação da análise. Atualmente, ainda existem itens pendentes que deverão ser atendidos antes da conclusão desta etapa."
24. EXEMPLO — PENDÊNCIA EXTERNA
"Considerando as informações registradas na demanda, especialmente nas observações, no checklist e na pendência externa, verifica-se que as providências internas relacionadas à atividade foram realizadas, permanecendo necessária a apresentação de documentação complementar para continuidade das tratativas. Atualmente, a demanda encontra-se aguardando o atendimento dessa pendência."
25. EXEMPLO — CORREÇÃO NECESSÁRIA
"Considerando as informações registradas na demanda, verifica-se que a documentação inicialmente apresentada foi analisada, tendo sido identificada a necessidade de ajustes e complementações. Atualmente, a atividade permanece pendente de correção dos elementos apontados para que seja possível dar continuidade às providências subsequentes."
26. FORMATO OBRIGATÓRIO DA SAÍDA
Retorne SOMENTE o texto formal da situação atual da atividade.
NÃO retorne:

* título;
* cabeçalho;
* tópicos;
* tabela;
* lista;
* status separado;
* checklist separado;
* pendência externa separada;
* explicação;
* análise;
* justificativa;
* raciocínio;
* JSON;
* Markdown.

A resposta deverá conter somente o texto pronto para ser gravado ou exibido no sistema.
27. ORDEM INTERNA DE PROCESSAMENTO
Antes de gerar a resposta:

1. leia a demanda;
2. leia integralmente a atividade;
3. leia todas as observações;
4. analise cada item do checklist;
5. verifique a pendência externa;
6. consulte atividades relacionadas quando necessário;
7. elimine informações duplicadas;
8. identifique providências concluídas;
9. identifique providências em andamento;
10. identifique pendências;
11. identifique dependências externas;
12. determine a situação atual;
13. produza o texto formal;
14. revise o texto antes de retornar.

28. VALIDAÇÃO FINAL
Antes de responder, confira internamente:

* O texto informa claramente como está a atividade?
* Todas as observações relevantes foram consideradas?
* O checklist foi analisado?
* A pendência externa foi considerada?
* Providência solicitada não foi confundida com providência concluída?
* Informações repetidas foram consolidadas?
* A situação atual está explícita?
* Se existe pendência externa, ela aparece claramente?
* O texto não contém informações inventadas?
* Não foram mencionadas datas?
* Não foram mencionados Interessado, Solicitante ou Responsável?
* O texto está formal e direto?
* O texto pode ser utilizado diretamente no sistema?

Somente após essa validação gere a resposta.
==================================================
REGRA CENTRAL
NÃO RESUMA OS CAMPOS DO SISTEMA.
INTERPRETE O ESTADO DA ATIVIDADE.
O objetivo é transformar todas as informações existentes em uma resposta administrativa simples para a pergunta:
"COMO ESTÁ ESTA DEMANDA NESTA ATIVIDADE NESTE MOMENTO?"
A resposta deverá deixar claro:
O QUE JÁ FOI FEITO
+
O QUE ESTÁ EM ANDAMENTO
+
O QUE ESTÁ PENDENTE
+
SE EXISTE PENDÊNCIA EXTERNA
+
QUAL É A SITUAÇÃO ATUAL.
Retorne somente o texto formal final.`

// Remove tags HTML do texto rico (Tiptap) das observações, deixando só texto simples pra
// entrada da IA — mesma lógica usada no resumo estruturado do frontend, espelhada aqui porque
// o relatório geral roda inteiramente no backend (processa todas as demandas de uma vez).
function htmlParaTexto(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

type DemandaParaRelatorioGeral = {
  gepNumero: string
  gepAno: string
  assunto: string
  descricao: string | null
  interessado: string | null
  status: string
  prioridade: string
  prazo: Date | null
  createdAt: Date
  atividades: {
    titulo: string
    instrucoes: string | null
    status: string
    prioridade: string
    prazo: Date | null
    observacoes: string | null
    motivoDevolucao: string | null
    passos: { descricao: string; concluido: boolean }[]
    pendenciasExternas: { orgao: string; descricao: string; status: string }[]
  }[]
}

// Monta o texto de entrada enviado à IA para UMA demanda — reúne tudo que o prompt pede
// (descrição, cada atividade com checklist, observações e pendência externa) pra IA analisar
// de uma vez e devolver o texto de situação atual daquela demanda.
function montarTextoDemandaParaRelatorioGeral(d: DemandaParaRelatorioGeral): string {
  const linhas: string[] = []
  linhas.push(`Demanda GEP ${d.gepNumero}/${d.gepAno}`)
  linhas.push(`Assunto: ${d.assunto}`)
  if (d.descricao) linhas.push(`Descrição da demanda: ${d.descricao}`)
  linhas.push(`Status geral cadastrado: ${d.status}`)
  linhas.push('')

  const atividades = d.atividades.filter(a => a.status !== 'CANCELADA')
  if (atividades.length === 0) {
    linhas.push('Nenhuma atividade cadastrada para esta demanda até o momento.')
    return linhas.join('\n')
  }

  atividades.forEach((a, i) => {
    linhas.push(`Atividade ${i + 1}: ${a.titulo}`)
    if (a.instrucoes) linhas.push(`Descrição/instruções da atividade: ${a.instrucoes}`)
    linhas.push(`Status cadastrado da atividade: ${a.status}`)
    if (a.passos.length > 0) {
      linhas.push('Checklist:')
      a.passos.forEach(p => linhas.push(`  - [${p.concluido ? 'CONCLUÍDO' : 'PENDENTE'}] ${p.descricao}`))
    }
    if (a.motivoDevolucao) linhas.push(`Motivo da última devolução: ${a.motivoDevolucao}`)
    const pendencias = a.pendenciasExternas.filter(p => p.status !== 'RESPONDIDA')
    if (pendencias.length > 0) {
      linhas.push('Pendência(s) externa(s) em aberto:')
      pendencias.forEach(p => linhas.push(`  - ${p.orgao}: ${p.descricao}`))
    }
    const observacoesTexto = a.observacoes ? htmlParaTexto(a.observacoes) : ''
    if (observacoesTexto) linhas.push(`Observações registradas: ${observacoesTexto}`)
    linhas.push('')
  })

  return linhas.join('\n')
}

// Roda até `limite` chamadas de IA em paralelo por vez — evita disparar dezenas de requisições
// simultâneas (custo/rate-limit) e ainda assim não fica inteiramente sequencial quando há
// muitas demandas.
async function mapComConcorrencia<T, R>(itens: T[], limite: number, fn: (item: T, indice: number) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(itens.length)
  let proximo = 0
  async function worker() {
    while (proximo < itens.length) {
      const indice = proximo++
      resultados[indice] = await fn(itens[indice], indice)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker))
  return resultados
}

interface LinhaRelatorioGeral {
  gep: string
  assunto: string
  status: string
  createdAt: Date
  historico: string
}

async function gerarLinhasRelatorioGeral(query: Record<string, string>): Promise<LinhaRelatorioGeral[]> {
  const where: Record<string, unknown> = {}
  if (query.status) where.status = query.status

  const demandas = await prisma.demanda.findMany({
    where,
    include: {
      atividades: {
        where: { status: { not: 'CANCELADA' } },
        include: { passos: { orderBy: { ordem: 'asc' } }, pendenciasExternas: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return mapComConcorrencia(demandas, 3, async (d) => {
    const textoEntrada = montarTextoDemandaParaRelatorioGeral(d)
    let historico: string
    try {
      const resultado = await gerarTextoIA(SYSTEM_PROMPT_RELATORIO_GERAL, textoEntrada)
      historico = resultado.texto
    } catch (e) {
      // Uma demanda com falha na IA não deve derrubar o relatório inteiro — registra o motivo
      // nessa linha e segue para as demais.
      historico = `[Não foi possível gerar a análise automática desta demanda: ${e instanceof AppError ? e.message : 'erro inesperado'}]`
    }
    return { gep: `${d.gepNumero}/${d.gepAno}`, assunto: d.assunto, status: d.status, createdAt: d.createdAt, historico }
  })
}

// ---- Relatório Geral (IA): uma análise por demanda, cobrindo todas as atividades dela ----

relatoriosRouter.get('/geral/pdf', requireMaster, async (req: AuthRequest, res: Response) => {
  const linhas = await gerarLinhasRelatorioGeral(req.query as Record<string, string>)

  const doc = new PDFDocument({ margin: 40, size: 'A4' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_geral_demandas.pdf')
  doc.pipe(res)

  const desenharCabecalho = () => {
    if (LOGO_BUFFER) doc.image(LOGO_BUFFER, doc.page.width / 2 - 40, doc.y, { width: 80 })
    doc.moveDown(LOGO_BUFFER ? 4.5 : 0)
    doc.fontSize(16).fillColor('#1e3a8a').font('Helvetica-Bold').text('Relatório Geral de Demandas', { align: 'center' })
    doc.fontSize(9).fillColor('#6b7280').font('Helvetica').text('Prefeitura Municipal de Vitória da Conquista', { align: 'center' })
    doc.fontSize(8).text(`Gerado em ${formatDate(new Date())} — ${linhas.length} demanda(s)`, { align: 'center' })
    doc.moveDown(1)
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#1e3a8a').lineWidth(1.5).stroke()
    doc.moveDown(0.8)
  }

  desenharCabecalho()

  linhas.forEach((l, i) => {
    // Reserva um espaço mínimo pro bloco não começar colado no rodapé da página.
    if (doc.y > doc.page.height - 160) {
      doc.addPage()
      desenharCabecalho()
    }
    const topoBloco = doc.y
    doc.fontSize(11).fillColor('#1e3a8a').font('Helvetica-Bold').text(`GEP ${l.gep} — ${l.assunto}`, 44, topoBloco + 6, { width: doc.page.width - 88 })
    doc.fontSize(8).fillColor('#6b7280').font('Helvetica').text(`Status: ${l.status}  |  Criada em: ${formatDate(l.createdAt)}`, 44, doc.y + 2)
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor('#111827').font('Helvetica').text(l.historico, 44, doc.y, { width: doc.page.width - 88, align: 'justify' })
    const baseBloco = doc.y + 8
    doc.roundedRect(40, topoBloco, doc.page.width - 80, baseBloco - topoBloco, 4).strokeColor('#e5e7eb').lineWidth(1).stroke()
    doc.y = baseBloco + 12
  })

  doc.end()
})

// ---- Relatório Geral (IA): Excel ----
relatoriosRouter.get('/geral/excel', requireMaster, async (req: AuthRequest, res: Response) => {
  const linhas = await gerarLinhasRelatorioGeral(req.query as Record<string, string>)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Relatório Geral')

  ws.mergeCells('A1:E1')
  const tituloCell = ws.getCell('A1')
  tituloCell.value = 'Relatório Geral de Demandas — Prefeitura Municipal de Vitória da Conquista'
  tituloCell.font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } }
  tituloCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  ws.mergeCells('A2:E2')
  const subCell = ws.getCell('A2')
  subCell.value = `Gerado em ${formatDate(new Date())} — ${linhas.length} demanda(s)`
  subCell.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  subCell.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  if (LOGO_BUFFER) {
    const imageId = wb.addImage({ buffer: LOGO_BUFFER as any, extension: 'png' })
    ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 60, height: 25 } })
  }

  ws.addRow([])
  const headerRowNum = 4
  ws.getRow(headerRowNum).values = ['Nº da Demanda (GEP)', 'Assunto', 'Status', 'Data de Criação', 'Histórico']
  const headerRow = ws.getRow(headerRowNum)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  headerRow.height = 20

  ws.columns = [
    { key: 'gep', width: 18 },
    { key: 'assunto', width: 30 },
    { key: 'status', width: 20 },
    { key: 'createdAt', width: 18 },
    { key: 'historico', width: 90 },
  ]

  linhas.forEach((l, i) => {
    const row = ws.addRow({ gep: l.gep, assunto: l.assunto, status: l.status, createdAt: formatDate(l.createdAt), historico: l.historico })
    row.eachCell(cell => { cell.alignment = { wrapText: true, vertical: 'top' } })
    if (i % 2 === 1) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } })
    }
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_geral_demandas.xlsx')
  await wb.xlsx.write(res)
})
