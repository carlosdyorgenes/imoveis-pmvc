import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

export const tiposDemandaRouter = Router()
tiposDemandaRouter.use(authenticate)

const TIPO_INCLUDE = {
  etapasModelo: { orderBy: { ordem: 'asc' as const } },
}

tiposDemandaRouter.get('/', async (req, res) => {
  const tipos = await prisma.tipoDemanda.findMany({
    where: { ativo: true },
    include: TIPO_INCLUDE,
    orderBy: { nome: 'asc' },
  })
  res.json(tipos)
})

tiposDemandaRouter.post('/', requireMaster, async (req: AuthRequest, res) => {
  const { nome, descricao, prazoPadraoDias } = req.body
  if (!nome?.trim()) throw new AppError('Nome do tipo de demanda é obrigatório')

  const existente = await prisma.tipoDemanda.findUnique({ where: { nome: nome.trim() } })
  if (existente) throw new AppError('Já existe um tipo de demanda com este nome')

  const tipo = await prisma.tipoDemanda.create({
    data: { nome: nome.trim(), descricao, prazoPadraoDias: prazoPadraoDias ? Number(prazoPadraoDias) : null },
    include: TIPO_INCLUDE,
  })
  res.status(201).json(tipo)
})

tiposDemandaRouter.put('/:id', requireMaster, async (req: AuthRequest, res) => {
  const { nome, descricao, prazoPadraoDias, ativo } = req.body
  const tipo = await prisma.tipoDemanda.update({
    where: { id: req.params.id },
    data: { nome, descricao, prazoPadraoDias: prazoPadraoDias ? Number(prazoPadraoDias) : null, ativo },
    include: TIPO_INCLUDE,
  })
  res.json(tipo)
})

tiposDemandaRouter.delete('/:id', requireMaster, async (req: AuthRequest, res) => {
  await prisma.tipoDemanda.delete({ where: { id: req.params.id } })
  res.json({ message: 'Tipo de demanda removido' })
})

// ===== Etapas do modelo (motor de fluxo configurável) =====

tiposDemandaRouter.post('/:tipoId/etapas', requireMaster, async (req: AuthRequest, res) => {
  const { titulo, instrucoes, equipeId, prazoDias } = req.body
  if (!titulo?.trim()) throw new AppError('Título da etapa é obrigatório')

  const tipo = await prisma.tipoDemanda.findUnique({ where: { id: req.params.tipoId } })
  if (!tipo) throw new AppError('Tipo de demanda não encontrado', 404)

  const count = await prisma.modeloEtapa.count({ where: { tipoDemandaId: tipo.id } })
  const etapa = await prisma.modeloEtapa.create({
    data: {
      tipoDemandaId: tipo.id,
      titulo: titulo.trim(),
      instrucoes,
      equipeId: equipeId || null,
      prazoDias: prazoDias ? Number(prazoDias) : null,
      ordem: count,
    },
  })
  res.status(201).json(etapa)
})

tiposDemandaRouter.delete('/etapas/:id', requireMaster, async (req: AuthRequest, res) => {
  await prisma.modeloEtapa.delete({ where: { id: req.params.id } })
  res.json({ message: 'Etapa do modelo removida' })
})
