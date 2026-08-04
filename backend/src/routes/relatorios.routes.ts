import { Router, Response } from 'express'
import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { calcularTemposAtividade } from '../domain/tempos'

export const relatoriosRouter = Router()
relatoriosRouter.use(authenticate)

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
  tipoDemanda: { select: { nome: true } },
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
  if (query.tipoDemandaId) where.tipoDemandaId = query.tipoDemandaId
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
      .text(`  Status: ${d.status} | Tipo: ${d.tipoDemanda?.nome || '—'} | Solicitante: ${d.solicitante.name}${d.prazo ? ` | Prazo: ${formatDate(d.prazo)}` : ''}`)
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
    { header: 'Tipo', key: 'tipo', width: 20 },
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
      tipo: d.tipoDemanda?.nome || '',
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
