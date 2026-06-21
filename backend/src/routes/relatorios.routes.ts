import { Router, Response } from 'express'
import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'

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

// ---- Tarefas PDF ----
relatoriosRouter.get('/tarefas/pdf', async (req: AuthRequest, res: Response) => {
  const tarefas = await prisma.tarefa.findMany({
    include: {
      cards: { include: { imovel: { select: { inscricaoImobiliaria: true, logradouro: true, bairro: true } }, user: { select: { name: true } } } }
    },
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
    doc.fontSize(12).fillColor('#1e40af').text(`${t.titulo} (${t.cards.length} imóveis)`)
    doc.fillColor('#000000')
    t.cards.forEach(c => {
      doc.fontSize(9).text(`  • ${c.imovel.inscricaoImobiliaria} - ${c.imovel.logradouro}, ${c.imovel.bairro} | Resp: ${c.user.name}`)
    })
    doc.moveDown(0.5)
  })

  doc.end()
})

// ---- Tarefas Excel ----
relatoriosRouter.get('/tarefas/excel', async (req: AuthRequest, res: Response) => {
  const tarefas = await prisma.tarefa.findMany({
    include: {
      cards: { include: { imovel: { select: { inscricaoImobiliaria: true, logradouro: true, bairro: true } }, user: { select: { name: true } } } }
    },
    orderBy: { ordem: 'asc' }
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Tarefas')
  ws.columns = [
    { header: 'Etapa', key: 'etapa', width: 25 },
    { header: 'Inscrição', key: 'inscricao', width: 22 },
    { header: 'Endereço', key: 'endereco', width: 40 },
    { header: 'Responsável', key: 'responsavel', width: 20 },
    { header: 'Adicionado em', key: 'data', width: 20 },
    { header: 'Observações', key: 'obs', width: 30 },
  ]
  ws.getRow(1).font = { bold: true }
  tarefas.forEach(t => {
    t.cards.forEach(c => {
      ws.addRow({
        etapa: t.titulo,
        inscricao: c.imovel.inscricaoImobiliaria,
        endereco: `${c.imovel.logradouro}, ${c.imovel.bairro}`,
        responsavel: c.user.name,
        data: formatDate(c.createdAt),
        obs: c.observacoes || ''
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
  doc.text(`Total de Etapas Kanban: ${totalTarefas}`)

  doc.end()
})
