import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requirePermissao, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'

export const equipesRouter = Router()
equipesRouter.use(authenticate)

const EQUIPE_INCLUDE = {
  membros: { include: { user: { select: { id: true, name: true, email: true, active: true } } } },
}

equipesRouter.get('/', async (req, res) => {
  const equipes = await prisma.equipe.findMany({ include: EQUIPE_INCLUDE, orderBy: { nome: 'asc' } })
  res.json(equipes)
})

equipesRouter.post('/', requirePermissao('equipes.gerenciar'), async (req: AuthRequest, res) => {
  const { nome, descricao } = req.body
  if (!nome?.trim()) throw new AppError('Nome da equipe é obrigatório')

  const existente = await prisma.equipe.findUnique({ where: { nome: nome.trim() } })
  if (existente) throw new AppError('Já existe uma equipe com este nome')

  const equipe = await prisma.equipe.create({ data: { nome: nome.trim(), descricao }, include: EQUIPE_INCLUDE })
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'EQUIPE', entityId: equipe.id, details: equipe.nome })
  res.status(201).json(equipe)
})

equipesRouter.put('/:id', requirePermissao('equipes.gerenciar'), async (req: AuthRequest, res) => {
  const { nome, descricao, ativo } = req.body
  const equipe = await prisma.equipe.update({
    where: { id: req.params.id },
    data: { nome, descricao, ativo },
    include: EQUIPE_INCLUDE,
  })
  res.json(equipe)
})

equipesRouter.delete('/:id', requirePermissao('equipes.gerenciar'), async (req: AuthRequest, res) => {
  await prisma.equipe.delete({ where: { id: req.params.id } })
  res.json({ message: 'Equipe removida' })
})

equipesRouter.post('/:id/membros', requirePermissao('equipes.gerenciar'), async (req: AuthRequest, res) => {
  const { userId, principal } = req.body
  if (!userId) throw new AppError('Usuário é obrigatório')

  const equipe = await prisma.equipe.findUnique({ where: { id: req.params.id } })
  if (!equipe) throw new AppError('Equipe não encontrada', 404)

  const jaEhMembro = await prisma.equipeMembro.findUnique({ where: { equipeId_userId: { equipeId: equipe.id, userId } } })
  if (jaEhMembro) throw new AppError('Usuário já é membro desta equipe')

  const membro = await prisma.equipeMembro.create({
    data: { equipeId: equipe.id, userId, principal: !!principal },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  res.status(201).json(membro)
})

equipesRouter.delete('/membros/:membroId', requirePermissao('equipes.gerenciar'), async (req: AuthRequest, res) => {
  await prisma.equipeMembro.delete({ where: { id: req.params.membroId } })
  res.json({ message: 'Membro removido da equipe' })
})
