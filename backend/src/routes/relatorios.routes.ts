import { Router, Response } from 'express'
import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
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

// Acrescenta quem emitiu ao final do subtítulo de qualquer relatório (PDF ou Excel) — usa o
// nome de quem está autenticado na requisição, igual em todos os relatórios do sistema.
function comEmissor(subtitulo: string, req: AuthRequest): string {
  return `${subtitulo} — Emitido por ${req.user!.name}`
}

const COR_TITULO = '#1e3a8a'
const COR_SUBTITULO = '#6b7280'
const COR_TEXTO = '#111827'
const COR_BORDA = '#e5e7eb'

// Cabeçalho padrão de TODOS os relatórios em PDF: brasão, título, "Prefeitura Municipal de
// Vitória da Conquista" e uma linha divisória — chamado uma vez no início e de novo a cada
// nova página, pra manter a identidade visual igual em qualquer relatório do sistema.
function desenharCabecalhoPDF(doc: PDFKit.PDFDocument, titulo: string, subtitulo?: string) {
  if (LOGO_BUFFER) {
    doc.image(LOGO_BUFFER, doc.page.width / 2 - 40, doc.y, { width: 80 })
    doc.moveDown(4.5)
  }
  doc.fontSize(16).fillColor(COR_TITULO).font('Helvetica-Bold').text(titulo, { align: 'center' })
  doc.fontSize(9).fillColor(COR_SUBTITULO).font('Helvetica').text('Prefeitura Municipal de Vitória da Conquista', { align: 'center' })
  if (subtitulo) doc.fontSize(8).text(subtitulo, { align: 'center' })
  doc.moveDown(1)
  doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor(COR_TITULO).lineWidth(1.5).stroke()
  doc.moveDown(0.8)
  doc.fillColor(COR_TEXTO).font('Helvetica')
}

// Cabeçalho padrão de TODOS os relatórios em Excel: título e subtítulo mesclados nas duas
// primeiras linhas, brasão no canto e a linha de cabeçalho da tabela já estilizada (fundo azul,
// texto branco) — devolve o número da linha onde a tabela de dados deve começar (a próxima).
function montarCabecalhoExcel(ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, colunas: { key: string; width: number }[], cabecalhos: string[]): number {
  const numCols = colunas.length

  ws.mergeCells(1, 1, 1, numCols)
  const tituloCell = ws.getCell(1, 1)
  tituloCell.value = titulo
  tituloCell.font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } }
  tituloCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  ws.mergeCells(2, 1, 2, numCols)
  const subCell = ws.getCell(2, 1)
  subCell.value = subtitulo
  subCell.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  subCell.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  if (LOGO_BUFFER) {
    const imageId = ws.workbook.addImage({ buffer: LOGO_BUFFER as any, extension: 'png' })
    ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 60, height: 25 } })
  }

  ws.columns = colunas
  const headerRowNum = 4
  ws.getRow(headerRowNum).values = cabecalhos
  const headerRow = ws.getRow(headerRowNum)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  headerRow.height = 20

  return headerRowNum + 1
}

// Zebra + quebra de linha automática pras linhas de dados de qualquer relatório Excel — chamar
// logo depois de ws.addRow(...) com o índice (0-based) da linha entre os dados.
function estilizarLinhaDados(row: ExcelJS.Row, indice: number) {
  row.eachCell(cell => { cell.alignment = { wrapText: true, vertical: 'top' } })
  if (indice % 2 === 1) {
    row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } })
  }
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

  desenharCabecalhoPDF(doc, 'Relatório de Imóveis', comEmissor(`Gerado em ${formatDate(new Date())} — ${imoveis.length} imóvel(is)`, req))

  imoveis.forEach((im, i) => {
    if (i > 0 && i % 4 === 0) { doc.addPage(); desenharCabecalhoPDF(doc, 'Relatório de Imóveis') }
    doc.fontSize(10).fillColor(COR_TITULO).font('Helvetica-Bold').text(`${im.inscricaoImobiliaria} — ${im.tipo} / ${im.zona}`)
    doc.fillColor(COR_TEXTO).font('Helvetica').fontSize(9)
      .text(`Endereço: ${im.logradouro}, ${im.numero || 'S/N'} - ${im.bairro}, ${im.cidade}/${im.estado}`)
      .text(`Secretaria: ${im.secretaria} | Ocorrências: ${im._count.ocorrencias}`)
      .moveDown(0.5)
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
  montarCabecalhoExcel(
    ws,
    'Relatório de Imóveis — Prefeitura Municipal de Vitória da Conquista',
    comEmissor(`Gerado em ${formatDate(new Date())} — ${imoveis.length} imóvel(is)`, req),
    [
      { key: 'inscricao', width: 22 },
      { key: 'logradouro', width: 30 },
      { key: 'numero', width: 10 },
      { key: 'bairro', width: 20 },
      { key: 'cidade', width: 20 },
      { key: 'estado', width: 8 },
      { key: 'secretaria', width: 25 },
      { key: 'tipo', width: 12 },
      { key: 'zona', width: 12 },
      { key: 'ocorrencias', width: 14 },
      { key: 'createdAt', width: 18 },
    ],
    ['Inscrição Imobiliária', 'Logradouro', 'Número', 'Bairro', 'Cidade', 'Estado', 'Secretaria', 'Tipo', 'Zona', 'Ocorrências', 'Cadastrado em']
  )
  imoveis.forEach((im, i) => {
    const row = ws.addRow({
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
    estilizarLinhaDados(row, i)
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

  desenharCabecalhoPDF(doc, 'Relatório de Ocorrências', comEmissor(`Gerado em ${formatDate(new Date())} — ${ocorrencias.length} ocorrência(s)`, req))

  ocorrencias.forEach(oc => {
    doc.fontSize(10).fillColor(COR_TITULO).font('Helvetica-Bold').text(`${formatDate(oc.createdAt)} — ${oc.tipo}`)
    doc.fillColor(COR_TEXTO).font('Helvetica').fontSize(9)
      .text(`Imóvel: ${oc.imovel.inscricaoImobiliaria} - ${oc.imovel.logradouro}, ${oc.imovel.bairro}`)
      .text(`Usuário: ${oc.user.name}`)
      .text(`Ocorrência: ${oc.descricao}`)
      .moveDown(0.6)
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
  montarCabecalhoExcel(
    ws,
    'Relatório de Ocorrências — Prefeitura Municipal de Vitória da Conquista',
    comEmissor(`Gerado em ${formatDate(new Date())} — ${ocorrencias.length} ocorrência(s)`, req),
    [
      { key: 'data', width: 20 },
      { key: 'inscricao', width: 22 },
      { key: 'endereco', width: 35 },
      { key: 'tipo', width: 14 },
      { key: 'descricao', width: 50 },
      { key: 'usuario', width: 20 },
    ],
    ['Data', 'Inscrição', 'Endereço', 'Tipo', 'Descrição', 'Usuário']
  )
  ocorrencias.forEach((oc, i) => {
    const row = ws.addRow({
      data: formatDate(oc.createdAt),
      inscricao: oc.imovel.inscricaoImobiliaria,
      endereco: `${oc.imovel.logradouro}, ${oc.imovel.bairro}`,
      tipo: oc.tipo,
      descricao: oc.descricao,
      usuario: oc.user.name
    })
    estilizarLinhaDados(row, i)
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

  desenharCabecalhoPDF(doc, 'Relatório de Tarefas', comEmissor(`Gerado em ${formatDate(new Date())} — ${tarefas.length} tarefa(s)`, req))

  tarefas.forEach(t => {
    const totalCards = t.etapas.reduce((acc, e) => acc + e.cards.length, 0)
    doc.fontSize(12).fillColor(COR_TITULO).font('Helvetica-Bold').text(`${t.titulo} (${totalCards} imóvel(is))`)
    doc.font('Helvetica')
    t.etapas.forEach(e => {
      doc.fontSize(10).fillColor('#374151').font('Helvetica-Bold').text(`  ${e.titulo} (${e.cards.length})`)
      doc.fillColor(COR_TEXTO).font('Helvetica')
      e.cards.forEach(c => {
        const concluidos = c.passos.filter(p => p.concluido).length
        const progresso = c.passos.length > 0 ? ` | Passos: ${concluidos}/${c.passos.length}` : ''
        doc.fontSize(9).text(`    • ${c.imovel.inscricaoImobiliaria} - ${c.imovel.logradouro}, ${c.imovel.bairro} | Resp: ${c.user.name}${progresso}`)
      })
    })
    doc.moveDown(0.6)
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
  montarCabecalhoExcel(
    ws,
    'Relatório de Tarefas — Prefeitura Municipal de Vitória da Conquista',
    comEmissor(`Gerado em ${formatDate(new Date())} — ${tarefas.length} tarefa(s)`, req),
    [
      { key: 'tarefa', width: 25 },
      { key: 'etapa', width: 25 },
      { key: 'inscricao', width: 22 },
      { key: 'endereco', width: 40 },
      { key: 'responsavel', width: 20 },
      { key: 'passos', width: 12 },
      { key: 'data', width: 20 },
      { key: 'obs', width: 30 },
    ],
    ['Tarefa', 'Etapa', 'Inscrição', 'Endereço', 'Responsável', 'Passos', 'Adicionado em', 'Observações']
  )
  let indiceLinha = 0
  tarefas.forEach(t => {
    t.etapas.forEach(e => {
      e.cards.forEach(c => {
        const concluidos = c.passos.filter(p => p.concluido).length
        const row = ws.addRow({
          tarefa: t.titulo,
          etapa: e.titulo,
          inscricao: c.imovel.inscricaoImobiliaria,
          endereco: `${c.imovel.logradouro}, ${c.imovel.bairro}`,
          responsavel: c.user.name,
          passos: c.passos.length > 0 ? `${concluidos}/${c.passos.length}` : '-',
          data: formatDate(c.createdAt),
          obs: c.observacoes || ''
        })
        estilizarLinhaDados(row, indiceLinha++)
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

  desenharCabecalhoPDF(doc, 'Resumo Geral', comEmissor(`Gerado em ${formatDate(new Date())}`, req))

  doc.fontSize(13).fillColor(COR_TITULO).font('Helvetica-Bold').text('Imóveis')
  doc.fillColor(COR_TEXTO).font('Helvetica').fontSize(11).text(`Total de Imóveis: ${totalImoveis}`)
  porTipo.forEach(g => doc.text(`  • ${g.tipo}: ${g._count}`))
  doc.moveDown(0.5)
  porZona.forEach(g => doc.text(`  • ${g.zona}: ${g._count}`))
  doc.moveDown()
  doc.fontSize(13).fillColor(COR_TITULO).font('Helvetica-Bold').text('Ocorrências e Tarefas')
  doc.fillColor(COR_TEXTO).font('Helvetica').fontSize(11).text(`Total de Ocorrências: ${totalOcorrencias}`)
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

  desenharCabecalhoPDF(doc, 'Relatório de Demandas', comEmissor(`Gerado em ${formatDate(new Date())} — ${demandas.length} demanda(s)`, req))

  demandas.forEach(d => {
    const atraso = atrasada(d.prazo)
    doc.fontSize(11).fillColor(atraso ? '#dc2626' : COR_TITULO).font('Helvetica-Bold')
      .text(`GEP ${d.gepNumero}/${d.gepAno} — ${d.assunto}${atraso ? ' [ATRASADA]' : ''}`)
    doc.fillColor(COR_TEXTO).font('Helvetica').fontSize(9)
      .text(`  Status: ${d.status} | Solicitante: ${d.solicitante.name}${d.prazo ? ` | Prazo: ${formatDate(d.prazo)}` : ''}`)
    d.atividades.forEach(a => {
      doc.text(`    • ${a.titulo} [${a.status}] — ${a.equipe ? `Equipe: ${a.equipe.nome}` : `Resp: ${a.responsavel?.name || '—'}`}`)
    })
    doc.moveDown(0.6)
  })

  doc.end()
})

// ---- Demandas Excel ----
relatoriosRouter.get('/demandas/excel', async (req: AuthRequest, res: Response) => {
  const demandas = await buscarDemandasRelatorio(req.query as Record<string, string>)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Demandas')
  montarCabecalhoExcel(
    ws,
    'Relatório de Demandas — Prefeitura Municipal de Vitória da Conquista',
    comEmissor(`Gerado em ${formatDate(new Date())} — ${demandas.length} demanda(s)`, req),
    [
      { key: 'gep', width: 16 },
      { key: 'assunto', width: 35 },
      { key: 'status', width: 18 },
      { key: 'solicitante', width: 20 },
      { key: 'prazo', width: 18 },
      { key: 'atrasada', width: 10 },
      { key: 'atividades', width: 12 },
    ],
    ['GEP', 'Assunto', 'Status', 'Solicitante', 'Prazo', 'Atrasada', 'Atividades']
  )
  demandas.forEach((d, i) => {
    const row = ws.addRow({
      gep: `${d.gepNumero}/${d.gepAno}`,
      assunto: d.assunto,
      status: d.status,
      solicitante: d.solicitante.name,
      prazo: d.prazo ? formatDate(d.prazo) : '',
      atrasada: atrasada(d.prazo) ? 'SIM' : 'NÃO',
      atividades: d.atividades.length,
    })
    estilizarLinhaDados(row, i)
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

  desenharCabecalhoPDF(doc, 'Demandas Atrasadas', comEmissor(`Gerado em ${formatDate(new Date())} — ${demandas.length} demanda(s)`, req))

  if (demandas.length === 0) {
    doc.fontSize(12).text('Nenhuma demanda atrasada no momento.', { align: 'center' })
  }
  demandas.forEach(d => {
    doc.fontSize(11).fillColor('#dc2626').font('Helvetica-Bold').text(`GEP ${d.gepNumero}/${d.gepAno} — ${d.assunto}`)
    doc.fillColor(COR_TEXTO).font('Helvetica').fontSize(9).text(`  Prazo vencido em: ${formatDate(d.prazo!)} | Status: ${d.status} | Solicitante: ${d.solicitante.name}`)
    doc.moveDown(0.4)
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

const SYSTEM_PROMPT_RELATORIO_GERAL = `Prompt — Situação Atual da Demanda por Atividade
Atue como analista administrativo especializado em acompanhamento de demandas e redação institucional.
Este prompt será executado individualmente para cada atividade de uma demanda cadastrada no sistema.
Sua função é analisar todas as informações disponíveis na atividade e produzir um texto formal, objetivo e conciso, descrevendo diretamente:

* o que foi realizado;
* quais providências foram adotadas;
* quais documentos ou informações foram produzidos, recebidos ou encaminhados;
* o que permanece pendente;
* se existe pendência externa;
* e, ao final, como a atividade se encontra atualmente.

1. FONTES DE INFORMAÇÃO
Analise integralmente:

* descrição da demanda;
* descrição da atividade;
* campo de observações;
* checklist;
* situação dos itens do checklist;
* pendência externa;
* descrição da pendência externa;
* movimentações relevantes;
* documentos mencionados ou anexados;
* status da atividade;
* informações complementares disponíveis.

Quando necessário para compreender determinado fato, consulte também outras atividades relacionadas à mesma demanda.
Não utilize apenas o status cadastrado.
O status deverá ser confrontado com as informações efetivamente registradas.
2. REGRA PRINCIPAL DE REDAÇÃO
NÃO utilize introduções genéricas como:
"Considerando as informações registradas na demanda..."
"Considerando as observações e pendências..."
"Após análise das informações..."
"Diante dos registros apresentados..."
"Conforme verificado na atividade..."
Comece DIRETAMENTE pelo fato administrativo relevante.
Exemplos adequados:
"Foi realizada a análise da documentação apresentada, sendo identificada a necessidade de complementação do memorial descritivo e da planta do imóvel."
"O levantamento técnico foi concluído e os documentos correspondentes foram anexados à atividade."
"A documentação encaminhada foi analisada, tendo sido solicitados ajustes na planta e no memorial descritivo."
"Foram concluídas as providências relacionadas à análise documental e à elaboração dos elementos técnicos necessários."
"O parecer foi elaborado e anexado à demanda, permanecendo pendente apenas o retorno da documentação complementar."
3. ORDEM DO TEXTO
O texto deverá seguir esta lógica:
Primeiro
Relate diretamente as principais providências que já foram realizadas.
Depois
Informe, quando houver:

* documentos produzidos;
* documentos recebidos;
* documentos encaminhados;
* análises realizadas;
* correções solicitadas;
* complementações;
* resultados obtidos.

Em seguida
Informe aquilo que permanece:

* em andamento;
* pendente;
* aguardando documento;
* aguardando manifestação;
* aguardando correção;
* aguardando providência externa.

Por último
Informe claramente como a atividade se encontra atualmente.
O leitor deverá compreender:
O que já foi feito?
O que ainda falta?
Como está a atividade neste momento?
4. CAMPO DE OBSERVAÇÕES
Leia integralmente todas as observações.
Identifique:

* providências realizadas;
* solicitações;
* documentos;
* análises;
* correções;
* devoluções;
* complementações;
* pendências;
* resultados.

Não copie as observações literalmente.
Consolide as informações.
Exemplo:
Registros:
"Memorial solicitado."
"Memorial elaborado."
"Arquivo anexado."
Resultado:
"O memorial descritivo solicitado foi elaborado e anexado à atividade."
5. CHECKLIST
Analise cada item do checklist.
Diferencie:
CONCLUÍDO
Providência efetivamente realizada.
EM ANDAMENTO
Providência iniciada, mas ainda não finalizada.
PENDENTE
Providência ainda necessária.
NÃO APLICÁVEL
Somente quando essa condição estiver claramente identificada.
Não considere um item concluído apenas porque foi solicitado ou iniciado.
6. PENDÊNCIA EXTERNA
Quando existir pendência externa, identifique exatamente o que está sendo aguardado.
Pode envolver:

* documento;
* manifestação;
* análise;
* parecer;
* assinatura;
* correção;
* complementação;
* retorno de outro setor;
* retorno de órgão externo.

Se a continuidade depender dessa providência, isso deverá aparecer claramente no final do texto.
Exemplo:
"As providências internas foram concluídas, permanecendo a atividade aguardando o envio da documentação complementar necessária ao prosseguimento da demanda."
7. NÃO CONFUNDIR SOLICITAÇÃO COM CONCLUSÃO
Registros como:

* solicitado;
* encaminhado;
* enviado para análise;
* aguardando;
* solicitado ajuste;
* encaminhado para correção;

NÃO significam conclusão.
Utilize verbos compatíveis com a situação real.
Solicitado
"Foi solicitada a apresentação de..."
Encaminhado
"O documento foi encaminhado para análise..."
Em andamento
"Encontra-se em andamento a elaboração de..."
Concluído
"Foi concluída a elaboração de..."
Pendente
"Permanece pendente..."
Dependência externa
"A atividade aguarda..."
8. CONSOLIDAÇÃO
Quando uma mesma informação aparecer:

* nas observações;
* no checklist;
* na pendência externa;
* nas movimentações;

não a repita.
Consolide em uma única frase.
Exemplo:
Em vez de:
"O memorial está pendente. O checklist informa que o memorial está pendente. A observação também informa que o memorial foi solicitado."
Utilize:
"Permanece pendente a apresentação do memorial descritivo solicitado."
9. SITUAÇÃO ATUAL
O último período ou parágrafo deverá obrigatoriamente indicar a situação atual.
Utilize construções naturais, como:
"Atualmente, a atividade encontra-se em andamento, permanecendo pendente a complementação da documentação."
"Atualmente, permanecem pendentes os ajustes solicitados para conclusão da atividade."
"Atualmente, a atividade aguarda o recebimento da documentação necessária para continuidade da análise."
"As providências internas foram concluídas, permanecendo a continuidade da demanda condicionada ao atendimento da pendência externa."
"Atualmente, não foram identificadas pendências relacionadas à atividade, encontrando-se esta etapa concluída."
"A atividade permanece em fase de análise, com necessidade de complementação dos elementos apresentados."
Não utilize uma conclusão incompatível com os registros.
10. NÃO MENCIONAR DATAS
Não mencione datas no texto final.
Utilize a ordem das movimentações apenas para compreender o andamento.
Quando necessário, utilize:

* inicialmente;
* posteriormente;
* após análise;
* atualmente.

Evite excesso dessas expressões.
11. NÃO MENCIONAR
Não utilize:

* Interessado;
* Solicitante;
* Responsável.

Não mencione nomes de pessoas apenas para descrever quem executou uma atividade.
O foco deverá permanecer nas providências e na situação da demanda.
12. EXTENSÃO
O texto deverá ser curto.
Atividade simples
1 parágrafo.
Atividade intermediária
1 a 2 parágrafos.
Atividade complexa
Máximo de 3 parágrafos.
Evite transformar o resultado em relatório extenso.
13. ESTILO
Utilize:

* português do Brasil;
* linguagem administrativa;
* formalidade;
* objetividade;
* clareza;
* coesão.

Evite:

* rodeios;
* repetições;
* introduções genéricas;
* linguagem jurídica excessiva;
* opinião;
* julgamento;
* explicação do funcionamento do sistema.

14. EXEMPLOS
Exemplo 1 — Em andamento
"A documentação apresentada foi analisada, tendo sido concluída parte das providências previstas e identificada a necessidade de complementação dos elementos técnicos. Permanecem pendentes os ajustes solicitados para continuidade da análise. Atualmente, a atividade encontra-se em andamento, aguardando o atendimento dessas pendências."
Exemplo 2 — Pendência externa
"A análise documental e as providências internas previstas foram concluídas, com a inclusão dos elementos produzidos na atividade. Permanece necessária a apresentação da documentação complementar solicitada. Atualmente, a continuidade da demanda encontra-se condicionada ao atendimento dessa pendência externa."
Exemplo 3 — Concluída
"Foram concluídas as análises e providências previstas para a atividade, com a inclusão dos documentos e informações necessários. Atualmente, não foram identificadas pendências relacionadas a esta etapa, encontrando-se a atividade concluída."
Exemplo 4 — Correção
"A documentação encaminhada foi analisada e foram identificadas inconsistências que necessitam de correção antes do prosseguimento da demanda. Os ajustes necessários foram registrados na atividade. Atualmente, permanece pendente a apresentação da documentação corrigida."
15. FORMATO DA RESPOSTA
Retorne SOMENTE o texto final.
Não apresente:

* título;
* cabeçalho;
* lista;
* tabela;
* classificação;
* checklist;
* explicação;
* justificativa;
* raciocínio;
* observações adicionais;
* Markdown;
* JSON.

O texto deverá estar pronto para ser inserido diretamente no sistema.
16. REGRA CENTRAL
O texto NÃO deverá explicar que analisou a demanda.
O texto deverá simplesmente INFORMAR A SITUAÇÃO DA DEMANDA.
Comece diretamente pelas providências realizadas.
Depois informe o que permanece pendente ou em andamento.
Finalize obrigatoriamente informando como a atividade se encontra atualmente.
Estrutura mental:
REALIZADO → PENDÊNCIAS → SITUAÇÃO ATUAL
Não crie introdução.
Não faça contextualização genérica.
Não repita os campos do sistema.
Não invente informações.
Retorne somente o texto administrativo final.`

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
    // Hash do texto de entrada JUNTO com o próprio prompt de sistema: se nada mudou nas
    // atividades/checklist/observações/pendências dessa demanda desde a última vez que o
    // relatório foi gerado, reaproveita a análise já feita em vez de chamar a IA de novo — mas
    // trocar o prompt (ex.: ajustar as regras de redação) já invalida o cache de todas as
    // demandas automaticamente, sem precisar limpar a tabela na mão.
    const assinatura = crypto.createHash('sha256').update(SYSTEM_PROMPT_RELATORIO_GERAL).update(textoEntrada).digest('hex')

    const cache = await prisma.relatorioGeralCache.findUnique({ where: { demandaId: d.id } })
    let historico: string
    if (cache && cache.assinatura === assinatura) {
      historico = cache.historico
    } else {
      try {
        const resultado = await gerarTextoIA(SYSTEM_PROMPT_RELATORIO_GERAL, textoEntrada)
        historico = resultado.texto
        await prisma.relatorioGeralCache.upsert({
          where: { demandaId: d.id },
          create: { demandaId: d.id, assinatura, historico, provedor: resultado.provedor },
          update: { assinatura, historico, provedor: resultado.provedor },
        })
      } catch (e) {
        // Uma demanda com falha na IA não deve derrubar o relatório inteiro — registra o motivo
        // nessa linha e segue para as demais, sem mexer no cache (mantém a última análise válida
        // pra próxima tentativa, se a atividade não mudar de novo antes disso).
        historico = `[Não foi possível gerar a análise automática desta demanda: ${e instanceof AppError ? e.message : 'erro inesperado'}]`
      }
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

  const subtitulo = comEmissor(`Gerado em ${formatDate(new Date())} — ${linhas.length} demanda(s)`, req)
  desenharCabecalhoPDF(doc, 'Relatório Geral de Demandas', subtitulo)

  linhas.forEach((l, i) => {
    // Reserva um espaço mínimo pro bloco não começar colado no rodapé da página.
    if (doc.y > doc.page.height - 160) {
      doc.addPage()
      desenharCabecalhoPDF(doc, 'Relatório Geral de Demandas')
    }
    const topoBloco = doc.y
    doc.fontSize(11).fillColor(COR_TITULO).font('Helvetica-Bold').text(`GEP ${l.gep} — ${l.assunto}`, 44, topoBloco + 6, { width: doc.page.width - 88 })
    doc.fontSize(8).fillColor(COR_SUBTITULO).font('Helvetica').text(`Status: ${l.status}  |  Criada em: ${formatDate(l.createdAt)}`, 44, doc.y + 2)
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(COR_TEXTO).font('Helvetica').text(l.historico, 44, doc.y, { width: doc.page.width - 88, align: 'justify' })
    const baseBloco = doc.y + 8
    doc.roundedRect(40, topoBloco, doc.page.width - 80, baseBloco - topoBloco, 4).strokeColor(COR_BORDA).lineWidth(1).stroke()
    doc.y = baseBloco + 12
  })

  doc.end()
})

// ---- Relatório Geral (IA): Excel ----
relatoriosRouter.get('/geral/excel', requireMaster, async (req: AuthRequest, res: Response) => {
  const linhas = await gerarLinhasRelatorioGeral(req.query as Record<string, string>)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Relatório Geral')
  montarCabecalhoExcel(
    ws,
    'Relatório Geral de Demandas — Prefeitura Municipal de Vitória da Conquista',
    comEmissor(`Gerado em ${formatDate(new Date())} — ${linhas.length} demanda(s)`, req),
    [
      { key: 'gep', width: 18 },
      { key: 'assunto', width: 30 },
      { key: 'status', width: 20 },
      { key: 'createdAt', width: 18 },
      { key: 'historico', width: 90 },
    ],
    ['Nº da Demanda (GEP)', 'Assunto', 'Status', 'Data de Criação', 'Histórico']
  )

  linhas.forEach((l, i) => {
    const row = ws.addRow({ gep: l.gep, assunto: l.assunto, status: l.status, createdAt: formatDate(l.createdAt), historico: l.historico })
    estilizarLinhaDados(row, i)
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=relatorio_geral_demandas.xlsx')
  await wb.xlsx.write(res)
})
