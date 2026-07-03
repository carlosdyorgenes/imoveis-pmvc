import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'

export const tarefasRouter = Router()
tarefasRouter.use(authenticate)

const CARD_INCLUDE = {
  imovel: true,
  user: { select: { name: true } },
  passos: { orderBy: { ordem: 'asc' as const } },
}

// ===== Tarefas (linhas do fluxograma) =====

tarefasRouter.get('/', async (req, res) => {
  const tarefas = await prisma.tarefa.findMany({
    include: {
      etapas: {
        include: { cards: { include: CARD_INCLUDE, orderBy: { ordem: 'asc' } } },
        orderBy: { ordem: 'asc' },
      },
    },
    orderBy: { ordem: 'asc' },
  })
  res.json(tarefas)
})

tarefasRouter.post('/', async (req: AuthRequest, res) => {
  const { titulo, descricao } = req.body
  if (!titulo) throw new AppError('Título é obrigatório')

  const count = await prisma.tarefa.count()
  const tarefa = await prisma.tarefa.create({
    data: { titulo, descricao, ordem: count, createdById: req.user!.id },
    include: { etapas: true },
  })
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'TAREFA', entityId: tarefa.id, details: titulo })
  res.status(201).json(tarefa)
})

tarefasRouter.put('/:id', async (req: AuthRequest, res) => {
  const { titulo, descricao, ordem } = req.body
  const tarefa = await prisma.tarefa.update({
    where: { id: req.params.id },
    data: { titulo, descricao, ordem },
  })
  await createLog({ userId: req.user!.id, action: 'UPDATE', entity: 'TAREFA', entityId: tarefa.id })
  res.json(tarefa)
})

tarefasRouter.delete('/:id', requireMaster, async (req: AuthRequest, res) => {
  await prisma.tarefa.delete({ where: { id: req.params.id } })
  await createLog({ userId: req.user!.id, action: 'DELETE', entity: 'TAREFA', entityId: req.params.id })
  res.json({ message: 'Tarefa excluída' })
})

// ===== Etapas (blocos do processo) =====

tarefasRouter.post('/:tarefaId/etapas', async (req: AuthRequest, res) => {
  const { titulo } = req.body
  if (!titulo) throw new AppError('Título da etapa é obrigatório')

  const tarefa = await prisma.tarefa.findUnique({ where: { id: req.params.tarefaId } })
  if (!tarefa) throw new AppError('Tarefa não encontrada', 404)

  const count = await prisma.etapa.count({ where: { tarefaId: req.params.tarefaId } })
  const etapa = await prisma.etapa.create({
    data: { tarefaId: req.params.tarefaId, titulo, ordem: count },
    include: { cards: { include: CARD_INCLUDE } },
  })
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'ETAPA', entityId: etapa.id, details: `${tarefa.titulo} > ${titulo}` })
  res.status(201).json(etapa)
})

tarefasRouter.put('/etapas/:id', async (req: AuthRequest, res) => {
  const { titulo, ordem } = req.body
  const etapa = await prisma.etapa.update({ where: { id: req.params.id }, data: { titulo, ordem } })
  await createLog({ userId: req.user!.id, action: 'UPDATE', entity: 'ETAPA', entityId: etapa.id })
  res.json(etapa)
})

tarefasRouter.delete('/etapas/:id', requireMaster, async (req: AuthRequest, res) => {
  await prisma.etapa.delete({ where: { id: req.params.id } })
  await createLog({ userId: req.user!.id, action: 'DELETE', entity: 'ETAPA', entityId: req.params.id })
  res.json({ message: 'Etapa excluída' })
})

// ===== Cards (imóveis dentro das etapas) =====

tarefasRouter.post('/etapas/:etapaId/cards', async (req: AuthRequest, res) => {
  const { imovelId, observacoes } = req.body
  if (!imovelId) throw new AppError('Imóvel é obrigatório')

  const etapa = await prisma.etapa.findUnique({
    where: { id: req.params.etapaId },
    include: { tarefa: { select: { titulo: true } } },
  })
  if (!etapa) throw new AppError('Etapa não encontrada', 404)

  const count = await prisma.tarefaCard.count({ where: { etapaId: etapa.id } })
  const card = await prisma.tarefaCard.create({
    data: { etapaId: etapa.id, imovelId, userId: req.user!.id, observacoes, ordem: count },
    include: CARD_INCLUDE,
  })

  await prisma.ocorrencia.create({
    data: {
      imovelId,
      userId: req.user!.id,
      descricao: `Imóvel adicionado à tarefa "${etapa.tarefa.titulo}" na etapa "${etapa.titulo}"`,
      tipo: 'TAREFA',
    },
  })

  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'TAREFA_CARD', entityId: card.id })
  res.status(201).json(card)
})

tarefasRouter.put('/cards/:cardId', async (req: AuthRequest, res) => {
  const { observacoes } = req.body
  const card = await prisma.tarefaCard.update({
    where: { id: req.params.cardId },
    data: { observacoes },
    include: CARD_INCLUDE,
  })
  res.json(card)
})

tarefasRouter.delete('/cards/:cardId', async (req: AuthRequest, res) => {
  const card = await prisma.tarefaCard.findUnique({
    where: { id: req.params.cardId },
    include: { etapa: { include: { tarefa: { select: { titulo: true } } } }, imovel: { select: { id: true } } },
  })
  if (!card) throw new AppError('Card não encontrado', 404)

  await prisma.tarefaCard.delete({ where: { id: card.id } })

  await prisma.ocorrencia.create({
    data: {
      imovelId: card.imovel.id,
      userId: req.user!.id,
      descricao: `Imóvel removido da tarefa "${card.etapa.tarefa.titulo}" (etapa "${card.etapa.titulo}")`,
      tipo: 'TAREFA',
    },
  })

  await createLog({ userId: req.user!.id, action: 'DELETE', entity: 'TAREFA_CARD', entityId: card.id })
  res.json({ message: 'Card removido' })
})

// Avançar card para a próxima etapa (exige todos os passos concluídos)
tarefasRouter.put('/cards/:cardId/avancar', async (req: AuthRequest, res) => {
  const card = await prisma.tarefaCard.findUnique({
    where: { id: req.params.cardId },
    include: {
      passos: true,
      etapa: { include: { tarefa: { include: { etapas: { orderBy: { ordem: 'asc' } } } } } },
    },
  })
  if (!card) throw new AppError('Card não encontrado', 404)

  const pendentes = card.passos.filter(p => !p.concluido)
  if (pendentes.length > 0) {
    throw new AppError(`Ainda há ${pendentes.length} passo(s) pendente(s) nesta etapa`)
  }

  const etapas = card.etapa.tarefa.etapas
  const idxAtual = etapas.findIndex(e => e.id === card.etapaId)
  const proxima = etapas[idxAtual + 1]
  if (!proxima) throw new AppError('Este imóvel já está na última etapa')

  const count = await prisma.tarefaCard.count({ where: { etapaId: proxima.id } })
  // Move e limpa os passos (a nova etapa terá seus próprios passos)
  const atualizado = await prisma.$transaction(async tx => {
    await tx.passo.deleteMany({ where: { cardId: card.id } })
    return tx.tarefaCard.update({
      where: { id: card.id },
      data: { etapaId: proxima.id, ordem: count },
      include: CARD_INCLUDE,
    })
  })

  await prisma.ocorrencia.create({
    data: {
      imovelId: card.imovelId,
      userId: req.user!.id,
      descricao: `Imóvel avançou de "${card.etapa.titulo}" para "${proxima.titulo}" na tarefa "${card.etapa.tarefa.titulo}"`,
      tipo: 'TAREFA',
    },
  })

  await createLog({ userId: req.user!.id, action: 'MOVE', entity: 'TAREFA_CARD', entityId: card.id, details: `Para etapa: ${proxima.titulo}` })
  res.json(atualizado)
})

// ===== Passos (checklist do card na etapa atual) =====

tarefasRouter.post('/cards/:cardId/passos', async (req: AuthRequest, res) => {
  const { descricao } = req.body
  if (!descricao?.trim()) throw new AppError('Descrição do passo é obrigatória')

  const card = await prisma.tarefaCard.findUnique({ where: { id: req.params.cardId } })
  if (!card) throw new AppError('Card não encontrado', 404)

  const count = await prisma.passo.count({ where: { cardId: card.id } })
  const passo = await prisma.passo.create({
    data: { cardId: card.id, descricao: descricao.trim(), ordem: count },
  })
  res.status(201).json(passo)
})

tarefasRouter.put('/passos/:id', async (req: AuthRequest, res) => {
  const { concluido, descricao } = req.body
  const passo = await prisma.passo.update({
    where: { id: req.params.id },
    data: {
      ...(typeof concluido === 'boolean' ? { concluido } : {}),
      ...(descricao?.trim() ? { descricao: descricao.trim() } : {}),
    },
  })
  res.json(passo)
})

tarefasRouter.delete('/passos/:id', async (req: AuthRequest, res) => {
  await prisma.passo.delete({ where: { id: req.params.id } })
  res.json({ message: 'Passo removido' })
})
