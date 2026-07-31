import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

export const notificacoesRouter = Router()
notificacoesRouter.use(authenticate)

notificacoesRouter.get('/', async (req: AuthRequest, res) => {
  const notificacoes = await prisma.notificacao.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  res.json(notificacoes)
})

notificacoesRouter.get('/count', async (req: AuthRequest, res) => {
  const count = await prisma.notificacao.count({ where: { userId: req.user!.id, lida: false } })
  res.json({ count })
})

notificacoesRouter.put('/:id/lida', async (req: AuthRequest, res) => {
  const notificacao = await prisma.notificacao.findUnique({ where: { id: req.params.id } })
  if (!notificacao) throw new AppError('Notificação não encontrada', 404)
  if (notificacao.userId !== req.user!.id) throw new AppError('Notificação não pertence a este usuário', 403)

  const atualizada = await prisma.notificacao.update({ where: { id: notificacao.id }, data: { lida: true } })
  res.json(atualizada)
})

notificacoesRouter.put('/marcar-todas-lidas', async (req: AuthRequest, res) => {
  await prisma.notificacao.updateMany({ where: { userId: req.user!.id, lida: false }, data: { lida: true } })
  res.json({ message: 'Notificações marcadas como lidas' })
})
