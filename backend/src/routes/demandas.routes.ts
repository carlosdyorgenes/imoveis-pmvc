import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'
import { notificar } from '../utils/notificar'
import { extrairParagrafosDocx, extrairItensCandidatos } from '../utils/docxParser'
import { previewImportacao } from '../data/previewImportacao'
import { TRANSICOES_DEMANDA, TRANSICOES_ATIVIDADE, transicaoValida, AÇÕES_DO_RESPONSAVEL, AÇÕES_DO_SOLICITANTE } from '../domain/estados'

export const demandasRouter = Router()
demandasRouter.use(authenticate)

// Upload real de documentos de atividade — persistido no volume /app/uploads (montado no Fly.io).
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'documentos')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const EXTENSOES_PERMITIDAS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.dwg', '.zip'])

const uploadDocumento = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `${crypto.randomUUID()}${ext}`)
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!EXTENSOES_PERMITIDAS.has(ext)) {
      return cb(new Error(`Extensão "${ext}" não permitida`))
    }
    cb(null, true)
  },
})

const DEMANDA_INCLUDE = {
  solicitante: { select: { id: true, name: true } },
  tipoDemanda: { select: { id: true, nome: true } },
  atividades: {
    include: {
      responsavel: { select: { id: true, name: true } },
      equipe: { select: { id: true, nome: true } },
      solicitante: { select: { id: true, name: true } },
      passos: { orderBy: { ordem: 'asc' as const } },
      documentos: { orderBy: { createdAt: 'desc' as const } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  historico: { orderBy: { createdAt: 'desc' as const } },
  pendenciasExternas: { orderBy: { createdAt: 'desc' as const } },
  comentarios: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
}

async function registrarHistorico(demandaId: string, userId: string, acao: string, descricao: string) {
  await prisma.historicoDemanda.create({ data: { demandaId, userId, acao, descricao } })
}

// Verifica se o usuário é responsável direto ou membro da equipe atribuída à atividade
async function isResponsavelDaAtividade(userId: string, atividade: { responsavelId: string | null; equipeId: string | null }) {
  if (atividade.responsavelId === userId) return true
  if (atividade.equipeId) {
    const membro = await prisma.equipeMembro.findUnique({
      where: { equipeId_userId: { equipeId: atividade.equipeId, userId } },
    })
    return !!membro
  }
  return false
}

// Notifica o(s) responsável(is) de uma atividade (usuário direto ou todos os membros da equipe)
async function notificarResponsaveis(atividade: { id: string; responsavelId: string | null; equipeId: string | null; demandaId: string; titulo: string }, tipo: string, mensagem: string) {
  const userIds: string[] = []
  if (atividade.responsavelId) userIds.push(atividade.responsavelId)
  if (atividade.equipeId) {
    const membros = await prisma.equipeMembro.findMany({ where: { equipeId: atividade.equipeId } })
    userIds.push(...membros.map(m => m.userId))
  }
  for (const userId of [...new Set(userIds)]) {
    await notificar(userId, tipo, mensagem, { demandaId: atividade.demandaId, atividadeId: atividade.id })
  }
}

// Escalonamento de prazo: sem infraestrutura de cron neste projeto, então roda de forma
// "preguiçosa" nas rotas mais acessadas (lista e painel), que o frontend já consulta a
// cada 60s. Notifica o solicitante e todos os MASTER (papel que atua como gestor) quando
// uma demanda vence o prazo, uma única vez por demanda (campo `escalonado`).
async function escalonarPrazosVencidos() {
  const vencidas = await prisma.demanda.findMany({
    where: { prazo: { lt: new Date() }, escalonado: false, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } },
    select: { id: true, gepNumero: true, gepAno: true, assunto: true, solicitanteId: true },
  })
  if (vencidas.length === 0) return

  const masters = await prisma.user.findMany({ where: { role: 'MASTER', active: true }, select: { id: true } })

  for (const d of vencidas) {
    const gep = `${d.gepNumero}/${d.gepAno}`
    const destinatarios = new Set([d.solicitanteId, ...masters.map(m => m.id)])
    for (const userId of destinatarios) {
      await notificar(userId, 'PRAZO_VENCIDO', `Prazo vencido: demanda "${d.assunto}" (GEP ${gep})`, { demandaId: d.id })
    }
    await registrarHistorico(d.id, d.solicitanteId, 'ESCALONAMENTO', `Prazo vencido — administradores notificados automaticamente`)
    await prisma.demanda.update({ where: { id: d.id }, data: { escalonado: true } })
  }
}

// ===== Painel de indicadores =====

demandasRouter.get('/painel/resumo', async (req: AuthRequest, res) => {
  await escalonarPrazosVencidos()
  const uid = req.user!.id

  const [porStatus, totalAtrasadas, minhasEquipes] = await Promise.all([
    prisma.demanda.groupBy({ by: ['status'], _count: true }),
    prisma.demanda.count({ where: { prazo: { lt: new Date() }, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } } }),
    prisma.equipeMembro.findMany({ where: { userId: uid }, select: { equipeId: true } }),
  ])

  const equipeIds = minhasEquipes.map(m => m.equipeId)

  const [minhasAtividadesPendentes, aguardandoMinhaAprovacao] = await Promise.all([
    prisma.atividade.count({
      where: {
        status: { in: ['ATRIBUIDA', 'EM_ANDAMENTO'] },
        OR: [{ responsavelId: uid }, ...(equipeIds.length ? [{ equipeId: { in: equipeIds } }] : [])],
      },
    }),
    prisma.atividade.count({ where: { status: 'CONCLUIDA', solicitanteId: uid } }),
  ])

  const statusMap: Record<string, number> = {}
  for (const g of porStatus) statusMap[g.status] = g._count

  res.json({
    porStatus: statusMap,
    totalDemandas: porStatus.reduce((acc, g) => acc + g._count, 0),
    totalAtrasadas,
    minhasAtividadesPendentes,
    aguardandoMinhaAprovacao,
  })
})

// ===== Demandas =====

demandasRouter.get('/', async (req, res) => {
  await escalonarPrazosVencidos()
  const { status, gep, tipoDemandaId, responsavelId, atrasadas } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (gep) where.gepNumero = { contains: gep, mode: 'insensitive' }
  if (tipoDemandaId) where.tipoDemandaId = tipoDemandaId
  if (atrasadas === 'true') {
    where.prazo = { lt: new Date() }
    where.status = { notIn: ['CONCLUIDA', 'CANCELADA'] }
  }
  if (responsavelId) {
    where.atividades = { some: { OR: [{ responsavelId }, { equipe: { membros: { some: { userId: responsavelId } } } }] } }
  }

  const demandas = await prisma.demanda.findMany({
    where,
    include: {
      solicitante: { select: { id: true, name: true } },
      tipoDemanda: { select: { id: true, nome: true } },
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
  const { gepNumero, gepAno, assunto, descricao, interessado, prazo, tipoDemandaId } = req.body
  if (!gepNumero?.trim() || !gepAno?.trim()) throw new AppError('Número e ano do GEP são obrigatórios')
  if (!assunto?.trim()) throw new AppError('Assunto é obrigatório')

  const existente = await prisma.demanda.findFirst({ where: { gepNumero: gepNumero.trim(), gepAno: gepAno.trim() } })

  let prazoFinal = prazo ? new Date(prazo) : null
  let tipo = null as { id: string; nome: string; prazoPadraoDias: number | null; etapasModelo: { id: string; titulo: string; instrucoes: string | null; ordem: number; equipeId: string | null; prazoDias: number | null }[] } | null

  if (tipoDemandaId) {
    tipo = await prisma.tipoDemanda.findUnique({ where: { id: tipoDemandaId }, include: { etapasModelo: { orderBy: { ordem: 'asc' } } } })
    if (!tipo) throw new AppError('Tipo de demanda inválido')
    if (!prazoFinal && tipo.prazoPadraoDias) {
      prazoFinal = new Date(Date.now() + tipo.prazoPadraoDias * 86400000)
    }
  }

  const demanda = await prisma.demanda.create({
    data: {
      gepNumero: gepNumero.trim(),
      gepAno: gepAno.trim(),
      assunto: assunto.trim(),
      descricao,
      interessado,
      prazo: prazoFinal,
      solicitanteId: req.user!.id,
      tipoDemandaId: tipo?.id,
    },
  })

  await registrarHistorico(demanda.id, req.user!.id, 'CRIACAO', `Demanda criada (GEP ${demanda.gepNumero}/${demanda.gepAno})${tipo ? ` — tipo: ${tipo.nome}` : ''}`)
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'DEMANDA', entityId: demanda.id, details: `GEP ${demanda.gepNumero}/${demanda.gepAno}` })

  // Motor de fluxo com dependência sequencial real: só a PRIMEIRA etapa do modelo é criada
  // agora. As etapas seguintes só são geradas automaticamente quando a anterior é aprovada
  // (ver ativarProximaEtapaDoFluxo, chamada na transição para APROVADA).
  if (tipo && tipo.etapasModelo.length > 0) {
    const primeira = tipo.etapasModelo[0]
    const atividade = await prisma.atividade.create({
      data: {
        demandaId: demanda.id,
        titulo: primeira.titulo,
        instrucoes: primeira.instrucoes,
        equipeId: primeira.equipeId,
        modeloEtapaId: primeira.id,
        solicitanteId: req.user!.id,
        prazo: primeira.prazoDias ? new Date(Date.now() + primeira.prazoDias * 86400000) : null,
      },
    })
    await registrarHistorico(demanda.id, req.user!.id, 'ATIVIDADE_CRIADA', `Atividade "${atividade.titulo}" (1ª etapa do modelo "${tipo.nome}") criada automaticamente`)
    if (primeira.equipeId) {
      await notificarResponsaveis(atividade, 'ATIVIDADE_ATRIBUIDA', `Nova atividade "${atividade.titulo}" (GEP ${demanda.gepNumero}/${demanda.gepAno})`)
    }
    await prisma.demanda.update({ where: { id: demanda.id }, data: { status: 'EM_ANDAMENTO' } })
  }

  res.status(201).json({
    ...demanda,
    avisoGepDuplicado: existente ? `Já existe uma demanda com o GEP ${demanda.gepNumero}/${demanda.gepAno} (${existente.id})` : null,
  })
})

demandasRouter.put('/:id', async (req: AuthRequest, res) => {
  const existente = await prisma.demanda.findUnique({ where: { id: req.params.id } })
  if (!existente) throw new AppError('Demanda não encontrada', 404)
  if (req.user!.role !== 'MASTER' && existente.solicitanteId !== req.user!.id) {
    throw new AppError('Somente quem criou a demanda (ou o Master) pode editá-la', 403)
  }

  const { assunto, descricao, interessado, prazo } = req.body
  const novoPrazo = prazo ? new Date(prazo) : null
  const prazoMudou = String(existente.prazo) !== String(novoPrazo)
  const demanda = await prisma.demanda.update({
    where: { id: req.params.id },
    data: {
      assunto, descricao, interessado, prazo: novoPrazo,
      ...(prazoMudou ? { escalonado: false } : {}),
    },
  })
  await registrarHistorico(demanda.id, req.user!.id, 'EDICAO', 'Dados da demanda atualizados')
  res.json(demanda)
})

// Exclusão definitiva — restrita ao Master, já que apaga atividades/checklist/documentos/
// histórico em cascata. Usada principalmente para remover demandas criadas por engano
// (o fluxo normal de "encerrar" uma demanda é CANCELADA/CONCLUIDA via /:id/status).
demandasRouter.delete('/:id', requireMaster, async (req: AuthRequest, res) => {
  const demanda = await prisma.demanda.findUnique({ where: { id: req.params.id } })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)

  const docs = await prisma.documentoAtividade.findMany({
    where: { atividade: { demandaId: demanda.id }, arquivoPath: { not: null } },
  })
  await prisma.demanda.delete({ where: { id: demanda.id } })
  for (const doc of docs) {
    if (doc.arquivoPath) fs.unlink(path.join(UPLOADS_DIR, doc.arquivoPath), () => {})
  }

  await createLog({ userId: req.user!.id, action: 'DELETE', entity: 'DEMANDA', entityId: demanda.id, details: `GEP ${demanda.gepNumero}/${demanda.gepAno}` })
  res.json({ message: 'Demanda excluída' })
})

demandasRouter.put('/:id/status', async (req: AuthRequest, res) => {
  const { status, motivo } = req.body
  const demanda = await prisma.demanda.findUnique({ where: { id: req.params.id } })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)

  if (!transicaoValida(TRANSICOES_DEMANDA, demanda.status, status)) {
    throw new AppError(`Transição inválida: "${demanda.status}" não pode ir para "${status}"`)
  }

  if (req.user!.role !== 'MASTER' && demanda.solicitanteId !== req.user!.id) {
    throw new AppError('Somente quem criou a demanda (ou o Master) pode alterar seu status', 403)
  }

  const atualizada = await prisma.demanda.update({ where: { id: demanda.id }, data: { status } })
  await registrarHistorico(demanda.id, req.user!.id, 'STATUS', `Status alterado de "${demanda.status}" para "${status}"${motivo ? ` — ${motivo}` : ''}`)
  res.json(atualizada)
})

// ===== Atividades =====

demandasRouter.post('/:demandaId/atividades', async (req: AuthRequest, res) => {
  const { titulo, instrucoes, responsavelId, equipeId, prazo } = req.body
  if (!titulo?.trim()) throw new AppError('Título da atividade é obrigatório')
  if (!responsavelId && !equipeId) throw new AppError('Informe um responsável ou uma equipe')

  const demanda = await prisma.demanda.findUnique({ where: { id: req.params.demandaId } })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)

  if (req.user!.role !== 'MASTER' && demanda.solicitanteId !== req.user!.id) {
    throw new AppError('Somente quem criou a demanda (ou o Master) pode atribuir atividades', 403)
  }

  let responsavelNome = ''
  if (responsavelId) {
    const responsavel = await prisma.user.findUnique({ where: { id: responsavelId } })
    if (!responsavel || !responsavel.active) throw new AppError('Responsável inválido')
    responsavelNome = responsavel.name
  }
  if (equipeId) {
    const equipe = await prisma.equipe.findUnique({ where: { id: equipeId } })
    if (!equipe || !equipe.ativo) throw new AppError('Equipe inválida')
    responsavelNome = equipe.nome
  }

  const atividade = await prisma.atividade.create({
    data: {
      demandaId: demanda.id,
      titulo: titulo.trim(),
      instrucoes,
      responsavelId: responsavelId || null,
      equipeId: equipeId || null,
      solicitanteId: req.user!.id,
      prazo: prazo ? new Date(prazo) : null,
    },
    include: { responsavel: { select: { id: true, name: true } }, equipe: { select: { id: true, nome: true } }, passos: true, documentos: true },
  })

  if (demanda.status === 'ABERTA') {
    await prisma.demanda.update({ where: { id: demanda.id }, data: { status: 'EM_ANDAMENTO' } })
  }

  await registrarHistorico(demanda.id, req.user!.id, 'ATIVIDADE_CRIADA', `Atividade "${atividade.titulo}" atribuída a ${responsavelNome}`)
  await notificarResponsaveis(atividade, 'ATIVIDADE_ATRIBUIDA', `Nova atividade "${atividade.titulo}" (GEP ${demanda.gepNumero}/${demanda.gepAno})`)
  res.status(201).json(atividade)
})

demandasRouter.put('/atividades/:id/status', async (req: AuthRequest, res) => {
  const { status, motivo, observacoes, linkDocumento } = req.body
  const atividade = await prisma.atividade.findUnique({
    where: { id: req.params.id },
    include: { demanda: { select: { id: true, assunto: true, gepNumero: true, gepAno: true } } },
  })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)

  if (!transicaoValida(TRANSICOES_ATIVIDADE, atividade.status, status)) {
    throw new AppError(`Transição inválida: "${atividade.status}" não pode ir para "${status}"`)
  }

  // Autorização: apenas o responsável (usuário ou membro da equipe) inicia/conclui;
  // apenas o solicitante aprova/devolve. MASTER sempre pode agir (override administrativo).
  const uid = req.user!.id
  const isResponsavel = await isResponsavelDaAtividade(uid, atividade)
  const isSolicitante = atividade.solicitanteId === uid
  const isMaster = req.user!.role === 'MASTER'

  if (!isMaster) {
    if (AÇÕES_DO_RESPONSAVEL.includes(status) && !isResponsavel) {
      throw new AppError('Somente o responsável pela atividade pode executar esta ação', 403)
    }
    if (AÇÕES_DO_SOLICITANTE.includes(status) && !isSolicitante) {
      throw new AppError('Somente o solicitante da atividade pode executar esta ação', 403)
    }
    if (status === 'CANCELADA' && !isResponsavel && !isSolicitante) {
      throw new AppError('Somente o responsável ou o solicitante podem cancelar esta atividade', 403)
    }
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
    include: { responsavel: { select: { id: true, name: true } }, equipe: { select: { id: true, nome: true } }, passos: { orderBy: { ordem: 'asc' } }, documentos: true },
  })

  const gep = `${atividade.demanda.gepNumero}/${atividade.demanda.gepAno}`
  const acaoDesc: Record<string, string> = {
    EM_ANDAMENTO: `Atividade "${atividade.titulo}" iniciada`,
    CONCLUIDA: `Atividade "${atividade.titulo}" concluída e devolvida ao solicitante${motivo ? ` (obs: ${motivo})` : ''}`,
    APROVADA: `Atividade "${atividade.titulo}" aprovada pelo solicitante`,
    DEVOLVIDA: `Atividade "${atividade.titulo}" devolvida para correção: ${motivo}`,
    CANCELADA: `Atividade "${atividade.titulo}" cancelada`,
  }

  await registrarHistorico(atividade.demandaId, req.user!.id, 'ATIVIDADE_STATUS', acaoDesc[status] || `Atividade "${atividade.titulo}" -> ${status}`)

  // Notificações por evento
  if (status === 'CONCLUIDA') {
    await notificar(atividade.solicitanteId, 'ATIVIDADE_CONCLUIDA', `Atividade "${atividade.titulo}" foi concluída e aguarda sua análise (GEP ${gep})`, { demandaId: atividade.demandaId, atividadeId: atividade.id })
  }
  if (status === 'DEVOLVIDA') {
    await notificarResponsaveis(atividade, 'ATIVIDADE_DEVOLVIDA', `Atividade "${atividade.titulo}" foi devolvida para correção (GEP ${gep}): ${motivo}`)
  }
  if (status === 'APROVADA') {
    await notificarResponsaveis(atividade, 'ATIVIDADE_APROVADA', `Sua atividade "${atividade.titulo}" foi aprovada (GEP ${gep})`)
    await ativarProximaEtapaDoFluxo(atividade.demandaId, atividade.id, req.user!.id)
  }

  res.json(atualizada)
})

// Motor de fluxo: quando uma atividade gerada por um ModeloEtapa é aprovada, cria
// automaticamente a atividade da próxima etapa do mesmo TipoDemanda (dependência sequencial
// real — a etapa 2 só existe depois que a etapa 1 foi de fato aprovada, não antes).
// Se não houver próxima etapa, conclui a demanda automaticamente.
async function ativarProximaEtapaDoFluxo(demandaId: string, atividadeAprovadaId: string, userId: string) {
  const atividadeAprovada = await prisma.atividade.findUnique({ where: { id: atividadeAprovadaId } })
  if (!atividadeAprovada?.modeloEtapaId) return // atividade manual, fora do motor de fluxo

  const etapaAtual = await prisma.modeloEtapa.findUnique({ where: { id: atividadeAprovada.modeloEtapaId } })
  if (!etapaAtual) return

  const demanda = await prisma.demanda.findUnique({ where: { id: demandaId } })
  if (!demanda) return

  const proxima = await prisma.modeloEtapa.findFirst({
    where: { tipoDemandaId: etapaAtual.tipoDemandaId, ordem: { gt: etapaAtual.ordem } },
    orderBy: { ordem: 'asc' },
  })

  if (!proxima) {
    // Última etapa do modelo aprovada: conclui a demanda automaticamente
    if (!['CONCLUIDA', 'CANCELADA'].includes(demanda.status)) {
      await prisma.demanda.update({ where: { id: demandaId }, data: { status: 'CONCLUIDA' } })
      await registrarHistorico(demandaId, userId, 'STATUS', 'Última etapa do fluxo aprovada — demanda concluída automaticamente')
    }
    return
  }

  const jaExiste = await prisma.atividade.findFirst({ where: { demandaId, modeloEtapaId: proxima.id } })
  if (jaExiste) return // idempotência: nunca cria a mesma etapa duas vezes

  const novaAtividade = await prisma.atividade.create({
    data: {
      demandaId,
      titulo: proxima.titulo,
      instrucoes: proxima.instrucoes,
      equipeId: proxima.equipeId,
      modeloEtapaId: proxima.id,
      solicitanteId: userId,
      prazo: proxima.prazoDias ? new Date(Date.now() + proxima.prazoDias * 86400000) : null,
    },
  })

  await registrarHistorico(demandaId, userId, 'ATIVIDADE_CRIADA', `Atividade "${novaAtividade.titulo}" (próxima etapa do fluxo) criada automaticamente`)
  if (proxima.equipeId) {
    await notificarResponsaveis(novaAtividade, 'ATIVIDADE_ATRIBUIDA', `Nova atividade "${novaAtividade.titulo}" (GEP ${demanda.gepNumero}/${demanda.gepAno})`)
  }
}

demandasRouter.delete('/atividades/:id', async (req: AuthRequest, res) => {
  const atividade = await prisma.atividade.findUnique({ where: { id: req.params.id } })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)
  if (req.user!.role !== 'MASTER' && atividade.solicitanteId !== req.user!.id) {
    throw new AppError('Somente quem criou a atividade (ou o Master) pode removê-la', 403)
  }
  await prisma.atividade.delete({ where: { id: atividade.id } })
  await registrarHistorico(atividade.demandaId, req.user!.id, 'ATIVIDADE_REMOVIDA', `Atividade "${atividade.titulo}" removida`)
  res.json({ message: 'Atividade removida' })
})

// ===== Checklist (passos da atividade) =====

async function assertPodeGerenciarChecklist(req: AuthRequest, atividade: { responsavelId: string | null; equipeId: string | null; solicitanteId: string }) {
  if (req.user!.role === 'MASTER') return
  const isResponsavel = await isResponsavelDaAtividade(req.user!.id, atividade)
  if (!isResponsavel && atividade.solicitanteId !== req.user!.id) {
    throw new AppError('Somente o responsável ou o solicitante da atividade podem gerenciar o checklist', 403)
  }
}

demandasRouter.post('/atividades/:atividadeId/passos', async (req: AuthRequest, res) => {
  const { descricao } = req.body
  if (!descricao?.trim()) throw new AppError('Descrição do passo é obrigatória')

  const atividade = await prisma.atividade.findUnique({ where: { id: req.params.atividadeId } })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)
  await assertPodeGerenciarChecklist(req, atividade)

  const count = await prisma.passoAtividade.count({ where: { atividadeId: atividade.id } })
  const passo = await prisma.passoAtividade.create({
    data: { atividadeId: atividade.id, descricao: descricao.trim(), ordem: count },
  })
  res.status(201).json(passo)
})

demandasRouter.put('/passos/:id', async (req: AuthRequest, res) => {
  const existente = await prisma.passoAtividade.findUnique({ where: { id: req.params.id }, include: { atividade: true } })
  if (!existente) throw new AppError('Passo não encontrado', 404)
  await assertPodeGerenciarChecklist(req, existente.atividade)

  const { concluido } = req.body
  const passo = await prisma.passoAtividade.update({
    where: { id: req.params.id },
    data: { concluido },
  })
  res.json(passo)
})

demandasRouter.delete('/passos/:id', async (req: AuthRequest, res) => {
  const existente = await prisma.passoAtividade.findUnique({ where: { id: req.params.id }, include: { atividade: true } })
  if (!existente) throw new AppError('Passo não encontrado', 404)
  await assertPodeGerenciarChecklist(req, existente.atividade)

  await prisma.passoAtividade.delete({ where: { id: req.params.id } })
  res.json({ message: 'Passo removido' })
})

// ===== Documentos da atividade (versionamento simplificado por link) =====

demandasRouter.post('/atividades/:atividadeId/documentos', async (req: AuthRequest, res) => {
  const { nome, linkDrive } = req.body
  if (!nome?.trim() || !linkDrive?.trim()) throw new AppError('Nome e link do documento são obrigatórios')

  const atividade = await prisma.atividade.findUnique({ where: { id: req.params.atividadeId } })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)
  await assertPodeGerenciarChecklist(req, atividade)

  // Versão = quantas vezes já foi anexado documento com o mesmo nome nesta atividade + 1
  const versaoAnterior = await prisma.documentoAtividade.count({ where: { atividadeId: atividade.id, nome: nome.trim() } })
  const documento = await prisma.documentoAtividade.create({
    data: { atividadeId: atividade.id, nome: nome.trim(), linkDrive: linkDrive.trim(), versao: versaoAnterior + 1, createdById: req.user!.id },
  })

  await registrarHistorico(atividade.demandaId, req.user!.id, 'DOCUMENTO_ANEXADO', `Documento "${documento.nome}" (v${documento.versao}) anexado à atividade "${atividade.titulo}"`)
  res.status(201).json(documento)
})

// Upload real de arquivo (persistido no volume, servido em /uploads/documentos/<arquivo>)
demandasRouter.post('/atividades/:atividadeId/documentos/upload', (req: AuthRequest, res, next) => {
  uploadDocumento.single('arquivo')(req, res, (err) => {
    if (err) return next(new AppError(err.message || 'Erro no upload do arquivo'))
    next()
  })
}, async (req: AuthRequest, res) => {
  const file = (req as AuthRequest & { file?: Express.Multer.File }).file
  if (!file) throw new AppError('Nenhum arquivo enviado')

  const atividade = await prisma.atividade.findUnique({ where: { id: req.params.atividadeId } })
  if (!atividade) {
    fs.unlink(file.path, () => {})
    throw new AppError('Atividade não encontrada', 404)
  }
  await assertPodeGerenciarChecklist(req, atividade)

  const nome = (req.body.nome as string)?.trim() || file.originalname
  const arquivoHash = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex')
  const versaoAnterior = await prisma.documentoAtividade.count({ where: { atividadeId: atividade.id, nome } })
  const documento = await prisma.documentoAtividade.create({
    data: {
      atividadeId: atividade.id,
      nome,
      linkDrive: `/uploads/documentos/${file.filename}`,
      versao: versaoAnterior + 1,
      createdById: req.user!.id,
      arquivoPath: file.filename,
      arquivoMime: file.mimetype,
      arquivoTamanho: file.size,
      arquivoHash,
    },
  })

  await registrarHistorico(atividade.demandaId, req.user!.id, 'DOCUMENTO_ANEXADO', `Arquivo "${documento.nome}" (v${documento.versao}) enviado na atividade "${atividade.titulo}"`)
  res.status(201).json(documento)
})

// Download autenticado (qualquer usuário logado, mesmo modelo de visibilidade das demandas).
// Preferível ao link estático: preserva o nome original no download e não depende de
// adivinhar a rota — mas como /uploads também é servido estaticamente (ver server.ts),
// o nome de arquivo aleatório (UUID) é a camada real de proteção contra acesso não autorizado
// por terceiros, equivalente ao modelo já usado no resto do sistema (link do Google Drive).
demandasRouter.get('/documentos/:id/arquivo', async (req: AuthRequest, res) => {
  const doc = await prisma.documentoAtividade.findUnique({ where: { id: req.params.id } })
  if (!doc || !doc.arquivoPath) throw new AppError('Arquivo não encontrado', 404)

  const filePath = path.join(UPLOADS_DIR, doc.arquivoPath)
  if (!fs.existsSync(filePath)) throw new AppError('Arquivo não encontrado no armazenamento', 404)

  res.download(filePath, doc.nome + path.extname(doc.arquivoPath))
})

// Recalcula o hash do arquivo em disco agora e compara com o hash salvo no upload.
// Detecta corrupção/alteração do arquivo depois de enviado (integridade real, não só
// confiança cega no armazenamento).
demandasRouter.get('/documentos/:id/verificar-integridade', async (req: AuthRequest, res) => {
  const doc = await prisma.documentoAtividade.findUnique({ where: { id: req.params.id } })
  if (!doc || !doc.arquivoPath) throw new AppError('Este documento não é um arquivo enviado (é um link)', 400)
  if (!doc.arquivoHash) throw new AppError('Este arquivo foi enviado antes do recurso de integridade existir — sem hash de referência', 400)

  const filePath = path.join(UPLOADS_DIR, doc.arquivoPath)
  if (!fs.existsSync(filePath)) {
    return res.json({ integro: false, motivo: 'Arquivo não encontrado no armazenamento (removido ou perdido)' })
  }

  const hashAtual = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  const integro = hashAtual === doc.arquivoHash
  res.json({ integro, hashOriginal: doc.arquivoHash, hashAtual, motivo: integro ? null : 'O conteúdo do arquivo não corresponde ao hash registrado no upload' })
})

demandasRouter.delete('/documentos/:id', async (req: AuthRequest, res) => {
  const doc = await prisma.documentoAtividade.findUnique({ where: { id: req.params.id }, include: { atividade: true } })
  if (!doc) throw new AppError('Documento não encontrado', 404)
  await assertPodeGerenciarChecklist(req, doc.atividade)
  await prisma.documentoAtividade.delete({ where: { id: doc.id } })
  if (doc.arquivoPath) {
    fs.unlink(path.join(UPLOADS_DIR, doc.arquivoPath), () => {})
  }
  res.json({ message: 'Documento removido' })
})

// ===== Pendências externas =====

demandasRouter.post('/:demandaId/pendencias', async (req: AuthRequest, res) => {
  const { orgao, descricao, protocolo, prazoEsperado } = req.body
  if (!orgao?.trim() || !descricao?.trim()) throw new AppError('Órgão e descrição são obrigatórios')

  const demanda = await prisma.demanda.findUnique({ where: { id: req.params.demandaId } })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)

  const pendencia = await prisma.pendenciaExterna.create({
    data: {
      demandaId: demanda.id,
      orgao: orgao.trim(),
      descricao: descricao.trim(),
      protocolo,
      prazoEsperado: prazoEsperado ? new Date(prazoEsperado) : null,
    },
  })

  if (demanda.status === 'EM_ANDAMENTO') {
    await prisma.demanda.update({ where: { id: demanda.id }, data: { status: 'AGUARDANDO_TERCEIRO' } })
  }

  await registrarHistorico(demanda.id, req.user!.id, 'PENDENCIA_EXTERNA', `Pendência externa registrada: aguardando ${orgao} — ${descricao}`)
  res.status(201).json(pendencia)
})

demandasRouter.put('/pendencias/:id', async (req: AuthRequest, res) => {
  const { status, resposta } = req.body
  const pendencia = await prisma.pendenciaExterna.findUnique({ where: { id: req.params.id } })
  if (!pendencia) throw new AppError('Pendência não encontrada', 404)

  const atualizada = await prisma.pendenciaExterna.update({
    where: { id: pendencia.id },
    data: {
      ...(status ? { status } : {}),
      ...(resposta !== undefined ? { resposta } : {}),
      ...(status === 'COBRADA' ? { ultimaCobranca: new Date() } : {}),
    },
  })

  await registrarHistorico(pendencia.demandaId, req.user!.id, 'PENDENCIA_EXTERNA', `Pendência de ${pendencia.orgao}: status -> ${status || pendencia.status}`)
  res.json(atualizada)
})

demandasRouter.delete('/pendencias/:id', async (req: AuthRequest, res) => {
  await prisma.pendenciaExterna.delete({ where: { id: req.params.id } })
  res.json({ message: 'Pendência removida' })
})

// ===== Comentários (com menção simples @Nome) =====

demandasRouter.post('/:demandaId/comentarios', async (req: AuthRequest, res) => {
  const { texto } = req.body
  if (!texto?.trim()) throw new AppError('Comentário não pode ser vazio')

  const demanda = await prisma.demanda.findUnique({ where: { id: req.params.demandaId } })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)

  const comentario = await prisma.comentario.create({
    data: { demandaId: demanda.id, userId: req.user!.id, texto: texto.trim() },
    include: { user: { select: { id: true, name: true } } },
  })

  await registrarHistorico(demanda.id, req.user!.id, 'COMENTARIO', `${comentario.user.name} comentou: "${texto.trim().slice(0, 80)}${texto.length > 80 ? '...' : ''}"`)

  // Menção simples: @Nome (ou parte do nome) dispara notificação para o usuário mencionado
  const mencoes = [...texto.matchAll(/@([\wÀ-ÿ]+(?:\s[\wÀ-ÿ]+)?)/g)].map(m => m[1])
  if (mencoes.length > 0) {
    const usuarios = await prisma.user.findMany({ where: { active: true } })
    const mencionados = new Set<string>()
    for (const nome of mencoes) {
      const encontrado = usuarios.find(u => u.name.toLowerCase().includes(nome.toLowerCase()) && u.id !== req.user!.id)
      if (encontrado) mencionados.add(encontrado.id)
    }
    for (const userId of mencionados) {
      await notificar(userId, 'MENCAO_COMENTARIO', `${comentario.user.name} mencionou você em um comentário (GEP ${demanda.gepNumero}/${demanda.gepAno})`, { demandaId: demanda.id })
    }
  }

  res.status(201).json(comentario)
})

demandasRouter.delete('/comentarios/:id', async (req: AuthRequest, res) => {
  const comentario = await prisma.comentario.findUnique({ where: { id: req.params.id } })
  if (!comentario) throw new AppError('Comentário não encontrado', 404)
  if (req.user!.role !== 'MASTER' && comentario.userId !== req.user!.id) {
    throw new AppError('Somente quem escreveu o comentário (ou o Master) pode removê-lo', 403)
  }
  await prisma.comentario.delete({ where: { id: comentario.id } })
  res.json({ message: 'Comentário removido' })
})

// ===== Importador assistido do DOCX de pendências antigas =====
// Não importa automaticamente: apresenta prévia extraída do documento de referência
// para revisão e correção manual antes de qualquer gravação em produção.

demandasRouter.get('/importar/preview', requireMaster, async (req, res) => {
  res.json(previewImportacao)
})

// Importador genérico: aceita qualquer .docx (não só o documento de referência fixo),
// extrai o texto real e devolve uma prévia heurística (best-effort, baseada em regex de
// padrão GEP "numero/ano") para revisão manual. Nunca grava nada — apenas processa em
// memória e descarta o arquivo (sem persistir no volume, diferente do upload de documentos).
const uploadDocxTemp = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

demandasRouter.post('/importar/upload-preview', requireMaster, (req: AuthRequest, res, next) => {
  uploadDocxTemp.single('arquivo')(req, res, (err) => {
    if (err) return next(new AppError(err.message || 'Erro no upload do arquivo'))
    next()
  })
}, async (req: AuthRequest, res) => {
  const file = (req as AuthRequest & { file?: Express.Multer.File }).file
  if (!file) throw new AppError('Nenhum arquivo enviado')
  if (!file.originalname.toLowerCase().endsWith('.docx')) throw new AppError('Envie um arquivo .docx')

  let paragrafos: string[]
  try {
    paragrafos = await extrairParagrafosDocx(file.buffer)
  } catch {
    throw new AppError('Não foi possível ler o arquivo — confirme que é um .docx válido')
  }

  const itens = extrairItensCandidatos(paragrafos)
  res.json({
    fonte: file.originalname,
    totalParagrafos: paragrafos.length,
    observacao: 'Prévia extraída automaticamente por heurística (padrão GEP "número/ano"). Revise e corrija cada item antes de confirmar — nada foi salvo ainda.',
    itens,
  })
})

interface ItemImportacao {
  gepNumero?: string | null
  gepAno?: string | null
  referenciaComplementar?: string
  assunto: string
  interessado?: string
  descricao?: string
  checklistSugerido?: { item: string; status: string }[]
}

// Recebe os itens já revisados/corrigidos pelo administrador e cria as demandas de fato.
// Itens sem GEP válido são rejeitados (GEP é obrigatório para novas demandas, conforme regra do sistema).
demandasRouter.post('/importar/confirmar', requireMaster, async (req: AuthRequest, res) => {
  const { itens } = req.body as { itens: ItemImportacao[] }
  if (!Array.isArray(itens) || itens.length === 0) throw new AppError('Nenhum item informado para importação')

  const criadas: string[] = []
  const rejeitados: { item: string; motivo: string }[] = []

  for (const item of itens) {
    if (!item.gepNumero?.trim() || !item.gepAno?.trim()) {
      rejeitados.push({ item: item.assunto, motivo: 'GEP incompleto — corrija o número/ano antes de importar' })
      continue
    }
    if (!item.assunto?.trim()) {
      rejeitados.push({ item: item.assunto || '(sem assunto)', motivo: 'Assunto ausente' })
      continue
    }

    const demanda = await prisma.demanda.create({
      data: {
        gepNumero: item.gepNumero.trim(),
        gepAno: item.gepAno.trim(),
        assunto: item.assunto.trim(),
        descricao: item.descricao,
        interessado: item.interessado,
        solicitanteId: req.user!.id,
      },
    })
    await registrarHistorico(demanda.id, req.user!.id, 'IMPORTACAO', 'Demanda criada via importação assistida do documento de referência')
    criadas.push(demanda.id)
  }

  res.json({ criadas: criadas.length, rejeitados })
})
