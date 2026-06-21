import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'
import { authenticate, AuthRequest } from '../middleware/auth'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) throw new AppError('Email e senha são obrigatórios')

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.active) throw new AppError('Credenciais inválidas', 401)

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw new AppError('Credenciais inválidas', 401)

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: '8h' })

  await createLog({
    userId: user.id,
    action: 'LOGIN',
    entity: 'USER',
    entityId: user.id,
    ip: req.ip
  })

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  })
})

authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  res.json(req.user)
})

authRouter.post('/logout', authenticate, async (req: AuthRequest, res) => {
  await createLog({
    userId: req.user!.id,
    action: 'LOGOUT',
    entity: 'USER',
    entityId: req.user!.id,
    ip: req.ip
  })
  res.json({ message: 'Logout realizado' })
})
