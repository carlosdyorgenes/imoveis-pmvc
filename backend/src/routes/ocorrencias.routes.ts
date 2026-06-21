import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'

export const ocorrenciasRouter = Router()
ocorrenciasRouter.use(authenticate)

ocorrenciasRouter.get('/', async (req, res) => {
  const { imovelId, inscricao } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}

  if (imovelId) where.imovelId = imovelId
  if (inscricao) {
    const imovel = await prisma.imovel.findFirst({ where: { inscricaoImobiliaria: { contains: inscricao, mode: 'insensitive' } } })
    if (!imovel) throw new AppError('Imóvel não encontrado', 404)
    where.imovelId = imovel.id
  }

  const ocorrencias = await prisma.ocorrencia.findMany({
    where,
    include: {
      user: { select: { name: true } },
      imovel: { select: { inscricaoImobiliaria: true, logradouro: true, bairro: true } }
    },
    orderBy: { createdAt: 'desc' }
  })
  res.json(ocorrencias)
})

ocorrenciasRouter.post('/', async (req: AuthRequest, res) => {
  const { imovelId, descricao, tipo } = req.body
  if (!imovelId || !descricao) throw new AppError('Imóvel e descrição são obrigatórios')

  const ocorrencia = await prisma.ocorrencia.create({
    data: { imovelId, userId: req.user!.id, descricao, tipo: tipo || 'MANUAL' },
    include: { user: { select: { name: true } } }
  })

  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'OCORRENCIA', entityId: ocorrencia.id })
  res.status(201).json(ocorrencia)
})
