import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'

export const demandasRouter = Router()
demandasRouter.use(authenticate)

const DEMANDA_INCLUDE = {
  solicitante: { select: { id: true, name: true } },
  atividades: {
    include: {
      responsavel: { select: { id: true, name: true } },
      solicitante: { select: { id: true, name: true } },
      passos: { orderBy: { ordem: 'asc' as const } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  historico: { orderBy: { createdAt: 'desc' as const } },
}

async function registrarHistorico(demandaId: string, userId: string, acao: string, descricao: string) {
  await prisma.historicoDemanda.create({ data: { demandaId, userId, acao, descricao } })
}

// ===== Demandas =====

demandasRouter.get('/', async (req, res) => {
  const { status, gep } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (gep) where.gepNumero = { contains: gep, mode: 'insensitive' }

  const demandas = await prisma.demanda.findMany({
    where,
    include: {
      solicitante: { select: { id: true, name: true } },
      atividades: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(demandas)
})

demandasRouter.get('/:id', async (req, res) => {
  const demanda = await prisma.demanda.findUnique({
    where: { id: req.params.id },
    include: DEMANDA_INCLUDE,
  })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)
  res.json(demanda)
})

demandasRouter.post('/', async (req: AuthRequest, res) => {
  const { gepNumero, gepAno, assunto, descricao, interessado, prazo } = req.body
  if (!gepNumero?.trim() || !gepAno?.trim()) throw new AppError('Número e ano do GEP são obrigatórios')
  if (!assunto?.trim()) throw new AppError('Assunto é obrigatório')

  const existente = await prisma.demanda.findFirst({ where: { gepNumero: gepNumero.trim(), gepAno: gepAno.trim() } })

  const demanda = await prisma.demanda.create({
    data: {
      gepNumero: gepNumero.trim(),
      gepAno: gepAno.trim(),
      assunto: assunto.trim(),
      descricao,
      interessado,
      prazo: prazo ? new Date(prazo) : null,
      solicitanteId: req.user!.id,
    },
  })

  await registrarHistorico(demanda.id, req.user!.id, 'CRIACAO', `Demanda criada (GEP ${demanda.gepNumero}/${demanda.gepAno})`)
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'DEMANDA', entityId: demanda.id, details: `GEP ${demanda.gepNumero}/${demanda.gepAno}` })

  res.status(201).json({
    ...demanda,
    avisoGepDuplicado: existente ? `Já existe uma demanda com o GEP ${demanda.gepNumero}/${demanda.gepAno} (${existente.id})` : null,
  })
})

demandasRouter.put('/:id', async (req: AuthRequest, res) => {
  const { assunto, descricao, interessado, prazo } = req.body
  const demanda = await prisma.demanda.update({
    where: { id: req.params.id },
    data: { assunto, descricao, interessado, prazo: prazo ? new Date(prazo) : null },
  })
  await registrarHistorico(demanda.id, req.user!.id, 'EDICAO', 'Dados da demanda atualizados')
  res.json(demanda)
})

// Transições válidas de status da demanda (não permite alteração livre)
const TRANSICOES_DEMANDA: Record<string, string[]> = {
  ABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['AGUARDANDO_TERCEIRO', 'DEVOLVIDA', 'CONCLUIDA', 'CANCELADA'],
  AGUARDANDO_TERCEIRO: ['EM_ANDAMENTO', 'CANCELADA'],
  DEVOLVIDA: ['EM_ANDAMENTO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
}

demandasRouter.put('/:id/status', async (req: AuthRequest, res) => {
  const { status, motivo } = req.body
  const demanda = await prisma.demanda.findUnique({ where: { id: req.params.id } })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)

  const permitido = TRANSICOES_DEMANDA[demanda.status] || []
  if (!permitido.includes(status)) {
    throw new AppError(`Transição inválida: "${demanda.status}" não pode ir para "${status}"`)
  }

  const atualizada = await prisma.demanda.update({ where: { id: demanda.id }, data: { status } })
  await registrarHistorico(demanda.id, req.user!.id, 'STATUS', `Status alterado de "${demanda.status}" para "${status}"${motivo ? ` — ${motivo}` : ''}`)
  res.json(atualizada)
})

// ===== Atividades =====

demandasRouter.post('/:demandaId/atividades', async (req: AuthRequest, res) => {
  const { titulo, instrucoes, responsavelId, prazo } = req.body
  if (!titulo?.trim()) throw new AppError('Título da atividade é obrigatório')
  if (!responsavelId) throw new AppError('Responsável é obrigatório')

  const demanda = await prisma.demanda.findUnique({ where: { id: req.params.demandaId } })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)

  const responsavel = await prisma.user.findUnique({ where: { id: responsavelId } })
  if (!responsavel || !responsavel.active) throw new AppError('Responsável inválido')

  const atividade = await prisma.atividade.create({
    data: {
      demandaId: demanda.id,
      titulo: titulo.trim(),
      instrucoes,
      responsavelId,
      solicitanteId: req.user!.id,
      prazo: prazo ? new Date(prazo) : null,
    },
    include: { responsavel: { select: { id: true, name: true } }, passos: true },
  })

  if (demanda.status === 'ABERTA') {
    await prisma.demanda.update({ where: { id: demanda.id }, data: { status: 'EM_ANDAMENTO' } })
  }

  await registrarHistorico(demanda.id, req.user!.id, 'ATIVIDADE_CRIADA', `Atividade "${atividade.titulo}" atribuída a ${responsavel.name}`)
  res.status(201).json(atividade)
})

// Transições válidas de status da atividade
const TRANSICOES_ATIVIDADE: Record<string, string[]> = {
  ATRIBUIDA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: ['APROVADA', 'DEVOLVIDA'],
  DEVOLVIDA: ['EM_ANDAMENTO', 'CANCELADA'],
  APROVADA: [],
  CANCELADA: [],
}

demandasRouter.put('/atividades/:id/status', async (req: AuthRequest, res) => {
  const { status, motivo, observacoes, linkDocumento } = req.body
  const atividade = await prisma.atividade.findUnique({
    where: { id: req.params.id },
    include: { demanda: { select: { id: true, assunto: true } } },
  })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)

  const permitido = TRANSICOES_ATIVIDADE[atividade.status] || []
  if (!permitido.includes(status)) {
    throw new AppError(`Transição inválida: "${atividade.status}" não pode ir para "${status}"`)
  }

  // Concluir exige justificativa quando houver passos obrigatórios pendentes
  if (status === 'CONCLUIDA') {
    const pendentes = await prisma.passoAtividade.count({ where: { atividadeId: atividade.id, concluido: false } })
    if (pendentes > 0 && !motivo) {
      throw new AppError(`Há ${pendentes} passo(s) pendente(s). Informe uma justificativa para concluir mesmo assim.`)
    }
  }

  // Devolução exige motivo
  if (status === 'DEVOLVIDA' && !motivo?.trim()) {
    throw new AppError('Informe o motivo da devolução')
  }

  const atualizada = await prisma.atividade.update({
    where: { id: atividade.id },
    data: {
      status,
      ...(observacoes !== undefined ? { observacoes } : {}),
      ...(linkDocumento !== undefined ? { linkDocumento } : {}),
      ...(status === 'DEVOLVIDA' ? { motivoDevolucao: motivo } : {}),
    },
    include: { responsavel: { select: { id: true, name: true } }, passos: { orderBy: { ordem: 'asc' } } },
  })

  const acaoDesc: Record<string, string> = {
    EM_ANDAMENTO: `Atividade "${atividade.titulo}" iniciada`,
    CONCLUIDA: `Atividade "${atividade.titulo}" concluída e devolvida ao solicitante${motivo ? ` (obs: ${motivo})` : ''}`,
    APROVADA: `Atividade "${atividade.titulo}" aprovada pelo solicitante`,
    DEVOLVIDA: `Atividade "${atividade.titulo}" devolvida para correção: ${motivo}`,
    CANCELADA: `Atividade "${atividade.titulo}" cancelada`,
  }

  await registrarHistorico(atividade.demandaId, req.user!.id, 'ATIVIDADE_STATUS', acaoDesc[status] || `Atividade "${atividade.titulo}" -> ${status}`)
  res.json(atualizada)
})

demandasRouter.delete('/atividades/:id', async (req: AuthRequest, res) => {
  const atividade = await prisma.atividade.findUnique({ where: { id: req.params.id } })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)
  await prisma.atividade.delete({ where: { id: atividade.id } })
  await registrarHistorico(atividade.demandaId, req.user!.id, 'ATIVIDADE_REMOVIDA', `Atividade "${atividade.titulo}" removida`)
  res.json({ message: 'Atividade removida' })
})

// ===== Checklist (passos da atividade) =====

demandasRouter.post('/atividades/:atividadeId/passos', async (req: AuthRequest, res) => {
  const { descricao } = req.body
  if (!descricao?.trim()) throw new AppError('Descrição do passo é obrigatória')

  const atividade = await prisma.atividade.findUnique({ where: { id: req.params.atividadeId } })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)

  const count = await prisma.passoAtividade.count({ where: { atividadeId: atividade.id } })
  const passo = await prisma.passoAtividade.create({
    data: { atividadeId: atividade.id, descricao: descricao.trim(), ordem: count },
  })
  res.status(201).json(passo)
})

demandasRouter.put('/passos/:id', async (req: AuthRequest, res) => {
  const { concluido } = req.body
  const passo = await prisma.passoAtividade.update({
    where: { id: req.params.id },
    data: { concluido },
  })
  res.json(passo)
})

demandasRouter.delete('/passos/:id', async (req: AuthRequest, res) => {
  await prisma.passoAtividade.delete({ where: { id: req.params.id } })
  res.json({ message: 'Passo removido' })
})
