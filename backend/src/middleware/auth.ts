import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from './errorHandler'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  user?: { id: string; role: string; name: string; email: string; permissoes: string[] }
}

// Perfil CONSULTA: acesso de leitura a todas as áreas, mas nenhuma inclusão, alteração ou
// exclusão em lugar nenhum do sistema — checado aqui dentro do authenticate (não em cada rota)
// pra não depender de lembrar de proteger cada endpoint novo individualmente. Exceções: a
// própria conta em /api/auth (trocar a própria senha, sair) e notificações pessoais em
// /api/notificacoes (marcar como lida), que não mexem em dado de negócio nenhum.
const METODOS_LEITURA = ['GET', 'HEAD', 'OPTIONS']
const PREFIXOS_LIBERADOS_PARA_CONSULTA = ['/api/auth', '/api/notificacoes']

export function bloqueiaEscritaDeConsulta(role: string, method: string, path: string): boolean {
  if (role !== 'CONSULTA') return false
  if (METODOS_LEITURA.includes(method)) return false
  if (PREFIXOS_LIBERADOS_PARA_CONSULTA.some(p => path.startsWith(p))) return false
  return true
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

    if (bloqueiaEscritaDeConsulta(user.role, req.method, req.originalUrl)) {
      throw new AppError('Seu perfil tem acesso somente para consulta — inclusão, alteração e exclusão não são permitidas.', 403)
    }

    next()
  } catch (e) {
    if (e instanceof AppError) throw e
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
