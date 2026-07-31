import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from './errorHandler'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  user?: { id: string; role: string; name: string; email: string; permissoes: string[] }
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) throw new AppError('Token não fornecido', 401)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, name: true, email: true, active: true, perfil: { select: { permissoes: true } } },
    })
    if (!user || !user.active) throw new AppError('Usuário não autorizado', 401)
    req.user = { id: user.id, role: user.role, name: user.name, email: user.email, permissoes: user.perfil?.permissoes || [] }
    next()
  } catch {
    throw new AppError('Token inválido', 401)
  }
}

export function requireMaster(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'MASTER') throw new AppError('Acesso restrito ao usuário Master', 403)
  next()
}

// RBAC dinâmico simplificado: libera acesso quando o usuário é MASTER (sempre) OU quando
// tem, via seu Perfil customizado, a permissão nomeada exigida pela rota.
export function requirePermissao(chave: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role === 'MASTER') return next()
    if (req.user?.permissoes.includes(chave)) return next()
    throw new AppError(`Acesso negado: requer a permissão "${chave}" (ou ser Master)`, 403)
  }
}
