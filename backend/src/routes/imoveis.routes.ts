import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'

export const imoveisRouter = Router()
imoveisRouter.use(authenticate)

const upload = multer({ dest: path.join(__dirname, '../../uploads/temp') })

imoveisRouter.get('/', async (req, res) => {
  const { search, tipo, zona, secretaria } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { inscricaoImobiliaria: { contains: search, mode: 'insensitive' } },
      { logradouro: { contains: search, mode: 'insensitive' } },
      { bairro: { contains: search, mode: 'insensitive' } }
    ]
  }
  if (tipo) where.tipo = tipo
  if (zona) where.zona = zona
  if (secretaria) where.secretaria = { contains: secretaria, mode: 'insensitive' }

  const imoveis = await prisma.imovel.findMany({
    where,
    include: { documentos: true, _count: { select: { ocorrencias: true } } },
    orderBy: { createdAt: 'desc' }
  })
  res.json(imoveis)
})

imoveisRouter.get('/:id', async (req, res) => {
  const imovel = await prisma.imovel.findUnique({
    where: { id: req.params.id },
    include: { documentos: true, ocorrencias: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' } } }
  })
  if (!imovel) throw new AppError('Imóvel não encontrado', 404)
  res.json(imovel)
})

imoveisRouter.post('/', async (req: AuthRequest, res) => {
  const { documentos, ...data } = req.body
  const imovel = await prisma.imovel.create({
    data: {
      ...data,
      documentos: documentos?.length ? { create: documentos } : undefined
    },
    include: { documentos: true }
  })
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'IMOVEL', entityId: imovel.id, details: `Inscrição: ${imovel.inscricaoImobiliaria}` })
  res.status(201).json(imovel)
})

imoveisRouter.put('/:id', async (req: AuthRequest, res) => {
  const { documentos, ...data } = req.body

  const imovel = await prisma.imovel.update({
    where: { id: req.params.id },
    data,
    include: { documentos: true }
  })

  await createLog({ userId: req.user!.id, action: 'UPDATE', entity: 'IMOVEL', entityId: imovel.id })
  res.json(imovel)
})

imoveisRouter.delete('/:id', requireMaster, async (req: AuthRequest, res) => {
  await prisma.imovel.delete({ where: { id: req.params.id } })
  await createLog({ userId: req.user!.id, action: 'DELETE', entity: 'IMOVEL', entityId: req.params.id })
  res.json({ message: 'Imóvel excluído' })
})

// Documentos
imoveisRouter.post('/:id/documentos', async (req: AuthRequest, res) => {
  const { descricao, linkDrive } = req.body
  const doc = await prisma.documento.create({ data: { imovelId: req.params.id, descricao, linkDrive } })
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'DOCUMENTO', entityId: doc.id })
  res.status(201).json(doc)
})

imoveisRouter.delete('/:imovelId/documentos/:docId', async (req: AuthRequest, res) => {
  await prisma.documento.delete({ where: { id: req.params.docId } })
  await createLog({ userId: req.user!.id, action: 'DELETE', entity: 'DOCUMENTO', entityId: req.params.docId })
  res.json({ message: 'Documento removido' })
})

// Template de importação
imoveisRouter.get('/template/download', (req, res) => {
  const wb = XLSX.utils.book_new()
  const headers = [
    'inscricaoImobiliaria', 'registroCartorario', 'cartorioImoveis',
    'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep',
    'secretaria', 'tipo (PROPRIO/LOCADO)', 'zona (URBANO/RURAL)',
    'latitude', 'longitude', 'area', 'observacoes'
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers])
  XLSX.utils.book_append_sheet(wb, ws, 'Imóveis')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.setHeader('Content-Disposition', 'attachment; filename=template_imoveis.xlsx')
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.send(buffer)
})

// Upload de planilha
imoveisRouter.post('/import/upload', upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) throw new AppError('Arquivo não enviado')

  const wb = XLSX.readFile(req.file.path)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)

  const results = { success: 0, errors: [] as string[] }

  for (const row of rows) {
    try {
      await prisma.imovel.create({
        data: {
          inscricaoImobiliaria: String(row['inscricaoImobiliaria'] || ''),
          registroCartorario: row['registroCartorario'] ? String(row['registroCartorario']) : undefined,
          cartorioImoveis: row['cartorioImoveis'] ? String(row['cartorioImoveis']) : undefined,
          logradouro: String(row['logradouro'] || ''),
          numero: row['numero'] ? String(row['numero']) : undefined,
          complemento: row['complemento'] ? String(row['complemento']) : undefined,
          bairro: String(row['bairro'] || ''),
          cidade: String(row['cidade'] || ''),
          estado: String(row['estado'] || ''),
          cep: row['cep'] ? String(row['cep']) : undefined,
          secretaria: String(row['secretaria'] || ''),
          tipo: String(row['tipo (PROPRIO/LOCADO)'] || 'PROPRIO') as 'PROPRIO' | 'LOCADO',
          zona: String(row['zona (URBANO/RURAL)'] || 'URBANO') as 'URBANO' | 'RURAL',
          latitude: row['latitude'] ? Number(row['latitude']) : undefined,
          longitude: row['longitude'] ? Number(row['longitude']) : undefined,
          area: row['area'] ? Number(row['area']) : undefined,
          observacoes: row['observacoes'] ? String(row['observacoes']) : undefined,
        }
      })
      results.success++
    } catch (e: unknown) {
      results.errors.push(`Linha ${results.success + results.errors.length + 2}: ${(e as Error).message}`)
    }
  }

  await createLog({ userId: req.user!.id, action: 'IMPORT', entity: 'IMOVEL', details: `${results.success} importados` })
  res.json(results)
})
