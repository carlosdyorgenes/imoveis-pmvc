import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster } from '../middleware/auth'

export const logsRouter = Router()
logsRouter.use(authenticate, requireMaster)

logsRouter.get('/', async (req, res) => {
  const { userId, entity, action, from, to } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}

  if (userId) where.userId = userId
  if (entity) where.entity = entity
  if (action) where.action = action
  if (from || to) {
    where.createdAt = {}
    if (from) (where.createdAt as Record<string, Date>).gte = new Date(from)
    if (to) (where.createdAt as Record<string, Date>).lte = new Date(to)
  }

  const logs = await prisma.log.findMany({
    where,
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500
  })
  res.json(logs)
})
