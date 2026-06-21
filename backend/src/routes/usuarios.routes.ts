import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'

export const usuariosRouter = Router()
usuariosRouter.use(authenticate)

usuariosRouter.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true }
  })
  res.json(users)
})

usuariosRouter.post('/', requireMaster, async (req: AuthRequest, res) => {
  const { name, email, password, role } = req.body
  if (!name || !email || !password) throw new AppError('Nome, email e senha são obrigatórios')

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) throw new AppError('Email já cadastrado')

  const hash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { name, email, password: hash, role: role || 'PADRAO' },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true }
  })

  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'USER', entityId: user.id, details: `Usuário ${name} criado` })
  res.status(201).json(user)
})

usuariosRouter.put('/:id', requireMaster, async (req: AuthRequest, res) => {
  const { name, email, role, active, password } = req.body
  const data: Record<string, unknown> = { name, email, role, active }
  if (password) data.password = await bcrypt.hash(password, 10)

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true }
  })

  await createLog({ userId: req.user!.id, action: 'UPDATE', entity: 'USER', entityId: user.id })
  res.json(user)
})

usuariosRouter.delete('/:id', requireMaster, async (req: AuthRequest, res) => {
  if (req.params.id === req.user!.id) throw new AppError('Não pode excluir seu próprio usuário')
  await prisma.user.delete({ where: { id: req.params.id } })
  await createLog({ userId: req.user!.id, action: 'DELETE', entity: 'USER', entityId: req.params.id })
  res.json({ message: 'Usuário excluído' })
})
