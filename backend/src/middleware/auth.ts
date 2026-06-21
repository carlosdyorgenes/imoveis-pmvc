import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from './errorHandler'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  user?: { id: string; role: string; name: string; email: string }
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) throw new AppError('Token não fornecido', 401)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string }
    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, role: true, name: true, email: true, active: true } })
    if (!user || !user.active) throw new AppError('Usuário não autorizado', 401)
    req.user = user
    next()
  } catch {
    throw new AppError('Token inválido', 401)
  }
}

export function requireMaster(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'MASTER') throw new AppError('Acesso restrito ao usuário Master', 403)
  next()
}
