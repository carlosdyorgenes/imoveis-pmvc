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

ocorrenciasRouter.put('/:id', async (req: AuthRequest, res) => {
  const { descricao } = req.body
  if (!descricao?.trim()) throw new AppError('Descrição é obrigatória')

  const ocorrencia = await prisma.ocorrencia.findUnique({ where: { id: req.params.id } })
  if (!ocorrencia) throw new AppError('Ocorrência não encontrada', 404)
  if (ocorrencia.tipo !== 'MANUAL') throw new AppError('Apenas ocorrências manuais podem ser editadas', 403)
  if (ocorrencia.userId !== req.user!.id) throw new AppError('Você não tem permissão para editar esta ocorrência', 403)

  const updated = await prisma.ocorrencia.update({
    where: { id: req.params.id },
    data: { descricao },
    include: { user: { select: { name: true } }, imovel: { select: { inscricaoImobiliaria: true, logradouro: true, bairro: true } } }
  })

  await createLog({ userId: req.user!.id, action: 'UPDATE', entity: 'OCORRENCIA', entityId: ocorrencia.id })
  res.json(updated)
})
