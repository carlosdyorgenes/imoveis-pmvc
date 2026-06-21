import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'

export const tarefasRouter = Router()
tarefasRouter.use(authenticate)

// Colunas (tarefas/etapas do kanban)
tarefasRouter.get('/', async (req, res) => {
  const tarefas = await prisma.tarefa.findMany({
    include: {
      cards: {
        include: { imovel: true, user: { select: { name: true } } },
        orderBy: { ordem: 'asc' }
      }
    },
    orderBy: { ordem: 'asc' }
  })
  res.json(tarefas)
})

tarefasRouter.post('/', async (req: AuthRequest, res) => {
  const { titulo, descricao } = req.body
  if (!titulo) throw new AppError('Título é obrigatório')

  const count = await prisma.tarefa.count()
  const tarefa = await prisma.tarefa.create({
    data: { titulo, descricao, ordem: count, createdById: req.user!.id },
    include: { cards: true }
  })
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'TAREFA', entityId: tarefa.id })
  res.status(201).json(tarefa)
})

tarefasRouter.put('/:id', async (req: AuthRequest, res) => {
  const { titulo, descricao, ordem } = req.body
  const tarefa = await prisma.tarefa.update({
    where: { id: req.params.id },
    data: { titulo, descricao, ordem },
    include: { cards: { include: { imovel: true, user: { select: { name: true } } } } }
  })
  await createLog({ userId: req.user!.id, action: 'UPDATE', entity: 'TAREFA', entityId: tarefa.id })
  res.json(tarefa)
})

tarefasRouter.delete('/:id', requireMaster, async (req: AuthRequest, res) => {
  await prisma.tarefa.delete({ where: { id: req.params.id } })
  await createLog({ userId: req.user!.id, action: 'DELETE', entity: 'TAREFA', entityId: req.params.id })
  res.json({ message: 'Tarefa excluída' })
})

// Cards
tarefasRouter.post('/:tarefaId/cards', async (req: AuthRequest, res) => {
  const { imovelId, observacoes } = req.body
  if (!imovelId) throw new AppError('Imóvel é obrigatório')

  const count = await prisma.tarefaCard.count({ where: { tarefaId: req.params.tarefaId } })
  const card = await prisma.tarefaCard.create({
    data: { tarefaId: req.params.tarefaId, imovelId, userId: req.user!.id, observacoes, ordem: count },
    include: { imovel: true, user: { select: { name: true } }, tarefa: { select: { titulo: true } } }
  })

  // Registrar ocorrência automática
  const tarefa = await prisma.tarefa.findUnique({ where: { id: req.params.tarefaId } })
  await prisma.ocorrencia.create({
    data: {
      imovelId,
      userId: req.user!.id,
      descricao: `Imóvel adicionado à tarefa "${tarefa?.titulo}"`,
      tipo: 'TAREFA'
    }
  })

  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'TAREFA_CARD', entityId: card.id })
  res.status(201).json(card)
})

tarefasRouter.put('/cards/:cardId/mover', async (req: AuthRequest, res) => {
  const { novaTarefaId, ordem } = req.body

  const cardAtual = await prisma.tarefaCard.findUnique({
    where: { id: req.params.cardId },
    include: { tarefa: { select: { titulo: true } }, imovel: { select: { id: true, inscricaoImobiliaria: true } } }
  })
  if (!cardAtual) throw new AppError('Card não encontrado', 404)

  const novaTarefa = await prisma.tarefa.findUnique({ where: { id: novaTarefaId } })
  if (!novaTarefa) throw new AppError('Tarefa destino não encontrada', 404)

  const card = await prisma.tarefaCard.update({
    where: { id: req.params.cardId },
    data: { tarefaId: novaTarefaId, ordem: ordem || 0 },
    include: { imovel: true, user: { select: { name: true } } }
  })

  // Registrar ocorrência automática de movimentação
  await prisma.ocorrencia.create({
    data: {
      imovelId: cardAtual.imovelId,
      userId: req.user!.id,
      descricao: `Imóvel movido de "${cardAtual.tarefa.titulo}" para "${novaTarefa.titulo}"`,
      tipo: 'TAREFA'
    }
  })

  await createLog({ userId: req.user!.id, action: 'MOVE', entity: 'TAREFA_CARD', entityId: card.id, details: `Para: ${novaTarefa.titulo}` })
  res.json(card)
})

tarefasRouter.put('/cards/:cardId', async (req: AuthRequest, res) => {
  const { observacoes } = req.body
  const card = await prisma.tarefaCard.update({
    where: { id: req.params.cardId },
    data: { observacoes },
    include: { imovel: true, user: { select: { name: true } } }
  })
  res.json(card)
})

tarefasRouter.delete('/cards/:cardId', async (req: AuthRequest, res) => {
  const card = await prisma.tarefaCard.findUnique({
    where: { id: req.params.cardId },
    include: { tarefa: { select: { titulo: true } } }
  })
  if (!card) throw new AppError('Card não encontrado', 404)

  await prisma.tarefaCard.delete({ where: { id: req.params.cardId } })

  await prisma.ocorrencia.create({
    data: {
      imovelId: card.imovelId,
      userId: req.user!.id,
      descricao: `Imóvel removido da tarefa "${card.tarefa.titulo}"`,
      tipo: 'TAREFA'
    }
  })

  await createLog({ userId: req.user!.id, action: 'DELETE', entity: 'TAREFA_CARD', entityId: req.params.cardId })
  res.json({ message: 'Card removido' })
})
