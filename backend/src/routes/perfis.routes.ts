import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'

export const perfisRouter = Router()
perfisRouter.use(authenticate)

// Catálogo fechado de permissões existentes no sistema — evita perfis com chaves
// inválidas/inexistentes que nunca liberariam nada (erro silencioso de digitação).
export const PERMISSOES_DISPONIVEIS = [
  { chave: 'equipes.gerenciar', descricao: 'Criar/editar equipes e gerenciar seus membros' },
  { chave: 'tipos_demanda.gerenciar', descricao: 'Criar/editar tipos de demanda e suas etapas-modelo' },
] as const

perfisRouter.get('/permissoes-disponiveis', (req, res) => {
  res.json(PERMISSOES_DISPONIVEIS)
})

perfisRouter.get('/', async (req, res) => {
  const perfis = await prisma.perfil.findMany({
    include: { usuarios: { select: { id: true, name: true, email: true } } },
    orderBy: { nome: 'asc' },
  })
  res.json(perfis)
})

perfisRouter.post('/', requireMaster, async (req: AuthRequest, res) => {
  const { nome, descricao, permissoes } = req.body
  if (!nome?.trim()) throw new AppError('Nome do perfil é obrigatório')

  const existente = await prisma.perfil.findUnique({ where: { nome: nome.trim() } })
  if (existente) throw new AppError('Já existe um perfil com este nome')

  const validas = (permissoes || []).filter((p: string) => PERMISSOES_DISPONIVEIS.some(d => d.chave === p))
  const perfil = await prisma.perfil.create({
    data: { nome: nome.trim(), descricao, permissoes: validas },
    include: { usuarios: true },
  })
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'PERFIL', entityId: perfil.id, details: perfil.nome })
  res.status(201).json(perfil)
})

perfisRouter.put('/:id', requireMaster, async (req: AuthRequest, res) => {
  const { nome, descricao, permissoes } = req.body
  const validas = permissoes ? (permissoes as string[]).filter(p => PERMISSOES_DISPONIVEIS.some(d => d.chave === p)) : undefined
  const perfil = await prisma.perfil.update({
    where: { id: req.params.id },
    data: { nome, descricao, ...(validas ? { permissoes: validas } : {}) },
    include: { usuarios: true },
  })
  res.json(perfil)
})

perfisRouter.delete('/:id', requireMaster, async (req: AuthRequest, res) => {
  await prisma.perfil.delete({ where: { id: req.params.id } })
  res.json({ message: 'Perfil removido' })
})

// Atribui/remove o perfil de um usuário (não altera o role MASTER/PADRAO)
perfisRouter.put('/usuarios/:userId', requireMaster, async (req: AuthRequest, res) => {
  const { perfilId } = req.body
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { perfilId: perfilId || null },
    select: { id: true, name: true, email: true, role: true, perfil: { select: { id: true, nome: true } } },
  })
  await createLog({ userId: req.user!.id, action: 'UPDATE', entity: 'USER_PERFIL', entityId: user.id, details: `Perfil: ${user.perfil?.nome || 'nenhum'}` })
  res.json(user)
})
