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
import { TRANSICOES_DEMANDA, TRANSICOES_ATIVIDADE, transicaoValida, AÇÕES_DO_RESPONSAVEL, AÇÕES_DO_SOLICITANTE, STATUS_ATIVIDADE_ATIVOS } from '../domain/estados'
import { calcularTemposAtividade } from '../domain/tempos'
import { isResponsavelOuEquipeDaAtividade, filtrarAtividadesVisiveis } from '../domain/visibilidade'
import { escolherResponsavelComMenorCarga } from '../domain/balanceamento'

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

async function registrarHistorico(demandaId: string, userId: string, acao: string, descricao: string, atividadeId?: string) {
  await prisma.historicoDemanda.create({ data: { demandaId, userId, acao, descricao, atividadeId } })
}

// Verifica se o usuário é responsável direto ou membro da equipe atribuída à atividade
// Só o responsável específico da atividade pode agir nela — um colega da mesma equipe que
// não foi o escolhido pela distribuição automática não é "responsável" (precisa de
// transferência explícita para assumir). O fallback por equipe só vale quando não há
// responsável individual definido (caso raro, dado legado).
async function isResponsavelDaAtividade(userId: string, atividade: { responsavelId: string | null; equipeId: string | null }) {
  if (atividade.responsavelId) return atividade.responsavelId === userId
  if (atividade.equipeId) {
    const membro = await prisma.equipeMembro.findUnique({
      where: { equipeId_userId: { equipeId: atividade.equipeId, userId } },
    })
    return !!membro
  }
  return false
}

async function getEquipeIdsDoUsuario(userId: string): Promise<string[]> {
  const membros = await prisma.equipeMembro.findMany({ where: { userId }, select: { equipeId: true } })
  return membros.map(m => m.equipeId)
}

// Notifica o(s) responsável(is) de uma atividade (usuário direto ou todos os membros da equipe)
// Notifica só quem de fato vê a atividade: o responsável individual quando definido, ou
// (fallback raro, sem responsável ainda) todos os membros da equipe — nunca os dois ao mesmo
// tempo, pra não notificar colegas que não têm acesso à atividade de outra pessoa.
async function notificarResponsaveis(atividade: { id: string; responsavelId: string | null; equipeId: string | null; demandaId: string; titulo: string }, tipo: string, mensagem: string) {
  let userIds: string[] = []
  if (atividade.responsavelId) {
    userIds = [atividade.responsavelId]
  } else if (atividade.equipeId) {
    const membros = await prisma.equipeMembro.findMany({ where: { equipeId: atividade.equipeId } })
    userIds = membros.map(m => m.userId)
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

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const inicioMesAnterior = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)

  const [porStatus, porPrioridade, totalAtrasadas, minhasEquipes, concluidasEsteMes, concluidasMesAnterior, demandasConcluidas, totalAtividadesAtivas, atividadesComDevolucao, demandasAtrasadasComAtividades] = await Promise.all([
    prisma.demanda.groupBy({ by: ['status'], _count: true }),
    prisma.demanda.groupBy({ by: ['prioridade'], _count: true, where: { status: { notIn: ['CONCLUIDA', 'CANCELADA'] } } }),
    prisma.demanda.count({ where: { prazo: { lt: new Date() }, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } } }),
    prisma.equipeMembro.findMany({ where: { userId: uid }, select: { equipeId: true } }),
    prisma.demanda.count({ where: { status: 'CONCLUIDA', updatedAt: { gte: inicioMes } } }),
    prisma.demanda.count({ where: { status: 'CONCLUIDA', updatedAt: { gte: inicioMesAnterior, lt: inicioMes } } }),
    // Amostra das últimas concluídas para estimar tempo médio de ciclo (criação -> conclusão).
    prisma.demanda.findMany({ where: { status: 'CONCLUIDA' }, select: { createdAt: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 200 }),
    prisma.atividade.count({ where: { status: { not: 'CANCELADA' } } }),
    prisma.atividade.count({ where: { status: { not: 'CANCELADA' }, motivoDevolucao: { not: null } } }),
    // Base para o alerta cruzado: demanda com prazo geral vencido, mas cujas atividades em
    // curso ainda não venceram (ou não têm prazo próprio) — some visível no card operacional
    // por equipe, mas o prazo macro da demanda já estourou.
    prisma.demanda.findMany({
      where: { prazo: { lt: new Date() }, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } },
      select: { id: true, atividades: { where: { status: { in: STATUS_ATIVIDADE_ATIVOS as any } }, select: { prazo: true } } },
    }),
  ])

  const equipeIds = minhasEquipes.map(m => m.equipeId)

  const [minhasAtividadesPendentes, aguardandoMinhaAprovacao, atrasadasNaMinhaEquipe] = await Promise.all([
    prisma.atividade.count({
      where: {
        status: { in: ['ATRIBUIDA', 'EM_ANDAMENTO'] },
        OR: [{ responsavelId: uid }, ...(equipeIds.length ? [{ equipeId: { in: equipeIds }, responsavelId: null }] : [])],
      },
    }),
    prisma.atividade.count({ where: { status: 'CONCLUIDA', solicitanteId: uid } }),
    // Atrasadas por prazo da própria atividade (não da demanda), restrito às equipes do
    // usuário logado — cada setor enxerga só o que é seu, em vez de um número geral opaco.
    equipeIds.length
      ? prisma.atividade.count({
          where: { prazo: { lt: new Date() }, status: { in: STATUS_ATIVIDADE_ATIVOS as any }, equipeId: { in: equipeIds } },
        })
      : Promise.resolve(0),
  ])

  const alertaCruzadoPrazo = demandasAtrasadasComAtividades.filter(
    d => !d.atividades.some(a => a.prazo && a.prazo < new Date())
  ).length

  const statusMap: Record<string, number> = {}
  for (const g of porStatus) statusMap[g.status] = g._count
  const totalDemandas = porStatus.reduce((acc, g) => acc + g._count, 0)
  const totalAtivas = totalDemandas - (statusMap.CONCLUIDA || 0) - (statusMap.CANCELADA || 0)

  const prioridadeMap: Record<string, number> = { ALTA: 0, MEDIA: 0, BAIXA: 0 }
  for (const g of porPrioridade) prioridadeMap[g.prioridade] = g._count

  const tempoMedioConclusaoDias = demandasConcluidas.length > 0
    ? Math.round(demandasConcluidas.reduce((acc, d) => acc + (d.updatedAt.getTime() - d.createdAt.getTime()), 0) / demandasConcluidas.length / 86400000 * 10) / 10
    : null

  res.json({
    porStatus: statusMap,
    porPrioridade: prioridadeMap,
    totalDemandas,
    totalAtivas,
    totalAtrasadas,
    percentualAtrasadas: totalAtivas > 0 ? Math.round((totalAtrasadas / totalAtivas) * 1000) / 10 : 0,
    minhasAtividadesPendentes,
    aguardandoMinhaAprovacao,
    concluidasEsteMes,
    concluidasMesAnterior,
    tempoMedioConclusaoDias,
    taxaDevolucao: totalAtividadesAtivas > 0 ? Math.round((atividadesComDevolucao / totalAtividadesAtivas) * 1000) / 10 : 0,
    atrasadasNaMinhaEquipe,
    alertaCruzadoPrazo,
  })
})

// Fila do usuário: prioridade (Alta > Média > Baixa) sempre antes de antiguidade — uma tarefa
// Alta recém-chegada aparece antes de uma Média ou Baixa mais antiga. Dentro da mesma
// prioridade, a atribuição mais antiga vem primeiro (FIFO). Ordenado em memória porque a
// ordem de prioridade não é alfabética (ALTA < BAIXA < MEDIA por ordem alfabética, mas a
// regra de negócio é ALTA > MEDIA > BAIXA).
// Usa a prioridade da própria atividade (não da demanda) — uma demanda Média pode ter uma
// atividade específica marcada como Alta, e é essa que deve furar a fila do responsável.
const PESO_PRIORIDADE: Record<string, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 }

// Fila do usuário (Seção 13): por padrão só o que está ativo (pendente/em andamento);
// ?todas=true traz também Devolvida/Concluída/Aprovada/Reaberta para as abas de
// histórico da tela "Minha Fila" no frontend.
demandasRouter.get('/atividades/minhas', async (req: AuthRequest, res) => {
  const uid = req.user!.id
  const todas = req.query.todas === 'true'
  const minhasEquipes = await prisma.equipeMembro.findMany({ where: { userId: uid }, select: { equipeId: true } })
  const equipeIds = minhasEquipes.map(m => m.equipeId)

  const statusFiltro = todas
    ? { not: 'CANCELADA' as const }
    : { in: ['ATRIBUIDA', 'EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO', 'REABERTA'] as Array<'ATRIBUIDA' | 'EM_ANDAMENTO' | 'AGUARDANDO_INFORMACAO' | 'REABERTA'> }

  const atividades = await prisma.atividade.findMany({
    where: {
      status: statusFiltro,
      // Só entra pela equipe quando não há responsável individual definido (dado legado) —
      // uma atividade já atribuída a um colega não aparece na fila de quem não foi escolhido.
      OR: [{ responsavelId: uid }, ...(equipeIds.length ? [{ equipeId: { in: equipeIds }, responsavelId: null }] : [])],
    },
    include: {
      demanda: { select: { id: true, gepNumero: true, gepAno: true, assunto: true, prioridade: true } },
      equipe: { select: { id: true, nome: true } },
      solicitante: { select: { id: true, name: true } },
    },
  })

  // A regra de prioridade + antiguidade (Seção 12) só rege a fila do que está pendente de ação;
  // fora dela, ordena por mais recente primeiro (uso puramente de consulta/histórico).
  atividades.sort((a, b) => {
    const ativaA = ['ATRIBUIDA', 'EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO', 'REABERTA'].includes(a.status)
    const ativaB = ['ATRIBUIDA', 'EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO', 'REABERTA'].includes(b.status)
    if (ativaA && ativaB) {
      const pa = PESO_PRIORIDADE[a.prioridade] ?? 1
      const pb = PESO_PRIORIDADE[b.prioridade] ?? 1
      if (pa !== pb) return pa - pb
      return a.createdAt.getTime() - b.createdAt.getTime()
    }
    if (ativaA !== ativaB) return ativaA ? -1 : 1
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  const comTempos = atividades.map(a => ({
    ...a,
    tempos: calcularTemposAtividade(a.createdAt, a.dataInicio, a.dataConclusao),
  }))

  res.json(comTempos)
})

// ===== Demandas =====

demandasRouter.get('/', async (req: AuthRequest, res) => {
  await escalonarPrazosVencidos()
  const { status, gep, responsavelId, atrasadas, prioridade } = req.query as Record<string, string>
  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (gep) where.gepNumero = { contains: gep, mode: 'insensitive' }
  if (prioridade) where.prioridade = prioridade
  if (atrasadas === 'true') {
    where.prazo = { lt: new Date() }
    where.status = { notIn: ['CONCLUIDA', 'CANCELADA'] }
  }
  if (responsavelId) {
    where.atividades = { some: { OR: [{ responsavelId }, { equipe: { membros: { some: { userId: responsavelId } } } }] } }
  }

  // Isolamento de processos: usuário PADRAO só lista demandas que ele abriu ou nas quais
  // tem/teve uma atividade atribuída a ele ou à sua equipe — nunca a base inteira.
  if (req.user!.role !== 'MASTER') {
    const equipeIds = await getEquipeIdsDoUsuario(req.user!.id)
    where.OR = [
      { solicitanteId: req.user!.id },
      { atividades: { some: { OR: [{ responsavelId: req.user!.id }, ...(equipeIds.length ? [{ equipeId: { in: equipeIds }, responsavelId: null }] : [])] } } },
    ]
  }

  const demandas = await prisma.demanda.findMany({
    where,
    include: {
      solicitante: { select: { id: true, name: true } },
      atividades: { select: { id: true, status: true, responsavelId: true, equipe: { select: { id: true, nome: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(demandas)
})

demandasRouter.get('/:id', async (req: AuthRequest, res) => {
  const demanda = await prisma.demanda.findUnique({
    where: { id: req.params.id },
    include: DEMANDA_INCLUDE,
  })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)

  const uid = req.user!.id
  const isMaster = req.user!.role === 'MASTER'
  const isSolicitante = demanda.solicitanteId === uid
  const vePorCompleto = isMaster || isSolicitante
  const equipeIds = vePorCompleto ? [] : await getEquipeIdsDoUsuario(uid)

  // Sem nenhuma relação com a demanda (não é quem abriu, não é MASTER, e não tem nenhuma
  // atividade atribuída a ele/sua equipe): acesso negado, nem para "espiar" o processo.
  if (!vePorCompleto && !demanda.atividades.some(a => isResponsavelOuEquipeDaAtividade(a, uid, equipeIds))) {
    throw new AppError('Você não possui permissão para acessar este conteúdo.', 403)
  }

  // Quem abriu a demanda (ou o MASTER) precisa ver todas as atividades para distribuir/analisar.
  // Um usuário de setor que só tem atividade(s) atribuída(s) enxerga apenas as suas — as demais
  // áreas ficam ocultas, mesmo dentro da mesma demanda.
  const atividadesVisiveis = filtrarAtividadesVisiveis(demanda.atividades, uid, equipeIds, vePorCompleto)

  const atividadesComTempos = atividadesVisiveis.map(a => ({
    ...a,
    tempos: calcularTemposAtividade(a.createdAt, a.dataInicio, a.dataConclusao),
  }))

  // Mesma lógica do isolamento de atividades: eventos do histórico presos a uma atividade
  // de outra área (criação, status, transferência, documento anexado) ficam ocultos também.
  const idsVisiveis = new Set(atividadesVisiveis.map(a => a.id))
  const historicoVisivel = vePorCompleto
    ? demanda.historico
    : demanda.historico.filter(h => !h.atividadeId || idsVisiveis.has(h.atividadeId))

  res.json({ ...demanda, atividades: atividadesComTempos, historico: historicoVisivel })
})

// Padrão de negócio do protocolo GEP: NUMERO/ANO (ex: 123456/2026) — validado em duas partes
// porque gepNumero e gepAno são colunas separadas no banco (id técnico é o uuid, não o GEP).
const GEP_NUMERO_REGEX = /^\d+$/
const GEP_ANO_REGEX = /^\d{4}$/

demandasRouter.post('/', requireMaster, async (req: AuthRequest, res) => {
  const { gepNumero: gepNumeroRaw, gepAno: gepAnoRaw, assunto, descricao, interessado, prazo, prioridade, confirmarDuplicado } = req.body
  const gepNumero = (gepNumeroRaw || '').trim().replace(/\s+/g, '')
  const gepAno = (gepAnoRaw || '').trim().replace(/\s+/g, '')
  if (!gepNumero || !gepAno) throw new AppError('Número e ano do GEP são obrigatórios')
  if (!GEP_NUMERO_REGEX.test(gepNumero)) throw new AppError('Número do GEP deve conter somente dígitos')
  if (!GEP_ANO_REGEX.test(gepAno)) throw new AppError('Ano do GEP deve ter 4 dígitos')
  if (!assunto?.trim()) throw new AppError('Assunto é obrigatório')
  if (prioridade && !['ALTA', 'MEDIA', 'BAIXA'].includes(prioridade)) throw new AppError('Prioridade inválida')

  const existente = await prisma.demanda.findFirst({ where: { gepNumero, gepAno } })
  // GEP duplicado nunca é criado silenciosamente: a primeira tentativa apenas avisa e devolve
  // o registro existente; só cria mesmo assim se o usuário confirmar explicitamente a segunda vez.
  if (existente && !confirmarDuplicado) {
    return res.status(409).json({
      error: `Já existe uma demanda com o GEP ${gepNumero}/${gepAno}`,
      demandaExistenteId: existente.id,
    })
  }

  const prazoFinal = prazo ? new Date(prazo) : null

  const demanda = await prisma.demanda.create({
    data: {
      gepNumero,
      gepAno,
      assunto: assunto.trim(),
      descricao,
      interessado,
      prazo: prazoFinal,
      prioridade: prioridade || 'MEDIA',
      solicitanteId: req.user!.id,
    },
  })

  await registrarHistorico(demanda.id, req.user!.id, 'CRIACAO', `Demanda criada (GEP ${demanda.gepNumero}/${demanda.gepAno})`)
  await createLog({ userId: req.user!.id, action: 'CREATE', entity: 'DEMANDA', entityId: demanda.id, details: `GEP ${demanda.gepNumero}/${demanda.gepAno}` })

  res.status(201).json(demanda)
})

demandasRouter.put('/:id', async (req: AuthRequest, res) => {
  const existente = await prisma.demanda.findUnique({ where: { id: req.params.id } })
  if (!existente) throw new AppError('Demanda não encontrada', 404)
  if (req.user!.role !== 'MASTER' && existente.solicitanteId !== req.user!.id) {
    throw new AppError('Somente quem criou a demanda (ou o Master) pode editá-la', 403)
  }

  const { assunto, descricao, interessado, prazo, prioridade } = req.body
  if (prioridade && !['ALTA', 'MEDIA', 'BAIXA'].includes(prioridade)) throw new AppError('Prioridade inválida')
  const novoPrazo = prazo ? new Date(prazo) : null
  const prazoMudou = String(existente.prazo) !== String(novoPrazo)
  const demanda = await prisma.demanda.update({
    where: { id: req.params.id },
    data: {
      assunto, descricao, interessado, prazo: novoPrazo,
      ...(prioridade ? { prioridade } : {}),
      ...(prazoMudou ? { escalonado: false } : {}),
    },
  })
  if (prioridade && prioridade !== existente.prioridade) {
    await registrarHistorico(demanda.id, req.user!.id, 'PRIORIDADE', `Prioridade alterada de ${existente.prioridade} para ${prioridade}`)
  }
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
  const { titulo, instrucoes, equipeId, prazo, anexoObrigatorio, prioridade } = req.body
  if (!titulo?.trim()) throw new AppError('Título da atividade é obrigatório')
  if (!equipeId) throw new AppError('Informe a equipe responsável')
  if (prioridade && !['ALTA', 'MEDIA', 'BAIXA'].includes(prioridade)) throw new AppError('Prioridade inválida')

  const demanda = await prisma.demanda.findUnique({ where: { id: req.params.demandaId } })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)

  if (req.user!.role !== 'MASTER' && demanda.solicitanteId !== req.user!.id) {
    throw new AppError('Somente quem criou a demanda (ou o Master) pode atribuir atividades', 403)
  }

  const equipe = await prisma.equipe.findUnique({ where: { id: equipeId } })
  if (!equipe || !equipe.ativo) throw new AppError('Equipe inválida')

  // Distribuição automática: escolhe o membro ativo da equipe com menos atividades em aberto
  // no momento, para nunca sobrecarregar sempre a mesma pessoa.
  const membros = await prisma.equipeMembro.findMany({ where: { equipeId, user: { active: true } }, select: { userId: true } })
  if (membros.length === 0) throw new AppError('Esta equipe não possui membros ativos para receber a atividade')

  const cargas = await Promise.all(membros.map(async m => ({
    userId: m.userId,
    ativas: await prisma.atividade.count({ where: { responsavelId: m.userId, status: { in: STATUS_ATIVIDADE_ATIVOS as any } } }),
  })))
  const responsavelId = escolherResponsavelComMenorCarga(cargas)!
  const responsavel = await prisma.user.findUnique({ where: { id: responsavelId }, select: { name: true } })

  const atividade = await prisma.atividade.create({
    data: {
      demandaId: demanda.id,
      titulo: titulo.trim(),
      instrucoes,
      responsavelId,
      equipeId,
      solicitanteId: req.user!.id,
      prazo: prazo ? new Date(prazo) : null,
      anexoObrigatorio: !!anexoObrigatorio,
      prioridade: prioridade || demanda.prioridade,
    },
    include: { responsavel: { select: { id: true, name: true } }, equipe: { select: { id: true, nome: true } }, passos: true, documentos: true },
  })

  if (demanda.status === 'ABERTA') {
    await prisma.demanda.update({ where: { id: demanda.id }, data: { status: 'EM_ANDAMENTO' } })
  } else {
    // Cobre o caso de uma atividade nova ser criada numa demanda já Concluída (ex.: reaberta
    // para outro setor) — reavalia o status geral em vez de deixá-la presa como Concluída.
    await atualizarStatusConformeAtividades(demanda.id)
  }

  await registrarHistorico(demanda.id, req.user!.id, 'ATIVIDADE_CRIADA', `Atividade "${atividade.titulo}" atribuída a ${responsavel?.name} (equipe ${equipe.nome}, por menor carga)`, atividade.id)
  await notificar(responsavelId, 'ATIVIDADE_ATRIBUIDA', `Nova atividade "${atividade.titulo}" (GEP ${demanda.gepNumero}/${demanda.gepAno})`, { demandaId: demanda.id, atividadeId: atividade.id })
  res.status(201).json(atividade)
})

demandasRouter.put('/atividades/:id/status', async (req: AuthRequest, res) => {
  const { status, motivo, observacoes, linkDocumento, informacoesFinalizacao } = req.body
  const atividade = await prisma.atividade.findUnique({
    where: { id: req.params.id },
    include: { demanda: { select: { id: true, assunto: true, gepNumero: true, gepAno: true } }, documentos: true },
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
    if ([...AÇÕES_DO_RESPONSAVEL, 'AGUARDANDO_INFORMACAO'].includes(status) && !isResponsavel) {
      throw new AppError('Somente o responsável pela atividade pode executar esta ação', 403)
    }
    if ([...AÇÕES_DO_SOLICITANTE, 'REABERTA'].includes(status) && !isSolicitante) {
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
    // Finalização (Bloco 5): exige o texto "informações das solicitações atendidas no GEP" e,
    // quando a atividade foi marcada com anexo obrigatório, exige ao menos um documento anexado.
    if (!informacoesFinalizacao?.trim()) {
      throw new AppError('Informe as informações das solicitações atendidas no GEP')
    }
    if (atividade.anexoObrigatorio && atividade.documentos.length === 0) {
      throw new AppError('Esta atividade exige ao menos um documento anexado para ser finalizada')
    }
  }

  // Devolução exige motivo
  if (status === 'DEVOLVIDA' && !motivo?.trim()) {
    throw new AppError('Informe o motivo da devolução')
  }
  // Reabertura exige justificativa (permissão já garantida acima — só o solicitante ou MASTER chegam aqui)
  if (status === 'REABERTA' && !motivo?.trim()) {
    throw new AppError('Informe a justificativa da reabertura')
  }

  const agora = new Date()
  const atualizada = await prisma.atividade.update({
    where: { id: atividade.id },
    data: {
      status,
      ...(observacoes !== undefined ? { observacoes } : {}),
      ...(linkDocumento !== undefined ? { linkDocumento } : {}),
      ...(status === 'DEVOLVIDA' ? { motivoDevolucao: motivo } : {}),
      ...(status === 'EM_ANDAMENTO' && !atividade.dataInicio ? { dataInicio: agora } : {}),
      ...(status === 'CONCLUIDA' ? { dataConclusao: agora, informacoesFinalizacao } : {}),
      ...(status === 'REABERTA' ? { dataConclusao: null, motivoDevolucao: motivo } : {}),
    },
    include: { responsavel: { select: { id: true, name: true } }, equipe: { select: { id: true, nome: true } }, passos: { orderBy: { ordem: 'asc' } }, documentos: true },
  })

  const gep = `${atividade.demanda.gepNumero}/${atividade.demanda.gepAno}`
  const acaoDesc: Record<string, string> = {
    EM_ANDAMENTO: `Atividade "${atividade.titulo}" iniciada`,
    AGUARDANDO_INFORMACAO: `Atividade "${atividade.titulo}" aguardando informação${motivo ? `: ${motivo}` : ''}`,
    CONCLUIDA: `Atividade "${atividade.titulo}" concluída e devolvida ao solicitante`,
    APROVADA: `Atividade "${atividade.titulo}" aprovada pelo solicitante`,
    DEVOLVIDA: `Atividade "${atividade.titulo}" devolvida para correção: ${motivo}`,
    REABERTA: `Atividade "${atividade.titulo}" reaberta: ${motivo}`,
    CANCELADA: `Atividade "${atividade.titulo}" cancelada`,
  }

  await registrarHistorico(atividade.demandaId, req.user!.id, 'ATIVIDADE_STATUS', acaoDesc[status] || `Atividade "${atividade.titulo}" -> ${status}`, atividade.id)

  // Notificações por evento
  if (status === 'CONCLUIDA') {
    await notificar(atividade.solicitanteId, 'ATIVIDADE_CONCLUIDA', `Atividade "${atividade.titulo}" foi concluída e aguarda sua análise (GEP ${gep})`, { demandaId: atividade.demandaId, atividadeId: atividade.id })
  }
  if (status === 'DEVOLVIDA') {
    await notificarResponsaveis(atividade, 'ATIVIDADE_DEVOLVIDA', `Atividade "${atividade.titulo}" foi devolvida para correção (GEP ${gep}): ${motivo}`)
  }
  if (status === 'REABERTA') {
    await notificarResponsaveis(atividade, 'ATIVIDADE_REABERTA', `Atividade "${atividade.titulo}" foi reaberta (GEP ${gep}): ${motivo}`)
  }
  if (status === 'APROVADA') {
    await notificarResponsaveis(atividade, 'ATIVIDADE_APROVADA', `Sua atividade "${atividade.titulo}" foi aprovada (GEP ${gep})`)
  }

  if (['CONCLUIDA', 'APROVADA', 'REABERTA', 'CANCELADA'].includes(status)) {
    await atualizarStatusConformeAtividades(atividade.demandaId)
  }

  res.json(atualizada)
})

// Transferência: só entre usuários ATIVOS da MESMA equipe/área do responsável atual — um
// usuário comum nunca pode transferir para outra área (só o MASTER pode, como override
// administrativo). Preserva dataInicio (tempo transcorrido não é reiniciado) e todo o
// histórico anterior; grava um registro imutável em HistoricoTransferencia.
demandasRouter.put('/atividades/:id/transferir', async (req: AuthRequest, res) => {
  const { novoResponsavelId, justificativa } = req.body
  if (!novoResponsavelId) throw new AppError('Informe o novo responsável')
  if (!justificativa?.trim()) throw new AppError('Informe a justificativa da transferência')

  const atividade = await prisma.atividade.findUnique({
    where: { id: req.params.id },
    include: { demanda: { select: { id: true, gepNumero: true, gepAno: true } } },
  })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)
  if (['APROVADA', 'CANCELADA'].includes(atividade.status)) {
    throw new AppError('Não é possível transferir uma atividade já finalizada')
  }

  const uid = req.user!.id
  const isMaster = req.user!.role === 'MASTER'
  const isResponsavelAtual = await isResponsavelDaAtividade(uid, atividade)
  if (!isMaster && !isResponsavelAtual) {
    throw new AppError('Somente o responsável atual (ou o Master) pode transferir esta atividade', 403)
  }

  const novoResponsavel = await prisma.user.findUnique({ where: { id: novoResponsavelId } })
  if (!novoResponsavel || !novoResponsavel.active) throw new AppError('Novo responsável inválido ou inativo')

  if (!isMaster) {
    if (!atividade.equipeId) {
      throw new AppError('Esta atividade não pertence a uma área/equipe — não é possível transferir')
    }
    const membroDestino = await prisma.equipeMembro.findUnique({
      where: { equipeId_userId: { equipeId: atividade.equipeId, userId: novoResponsavelId } },
    })
    if (!membroDestino) throw new AppError('O novo responsável precisa ser membro da mesma área/equipe')
  }

  const responsavelAnteriorId = atividade.responsavelId || uid

  const atualizada = await prisma.$transaction(async tx => {
    const a = await tx.atividade.update({
      where: { id: atividade.id },
      data: { responsavelId: novoResponsavelId },
      include: { responsavel: { select: { id: true, name: true } }, equipe: { select: { id: true, nome: true } }, passos: { orderBy: { ordem: 'asc' } }, documentos: true },
    })
    await tx.historicoTransferencia.create({
      data: { atividadeId: atividade.id, deUsuarioId: responsavelAnteriorId, paraUsuarioId: novoResponsavelId, justificativa: justificativa.trim() },
    })
    return a
  })

  const gep = `${atividade.demanda.gepNumero}/${atividade.demanda.gepAno}`
  await registrarHistorico(atividade.demandaId, uid, 'ATIVIDADE_TRANSFERIDA', `Atividade "${atividade.titulo}" transferida para ${novoResponsavel.name}: ${justificativa.trim()}`, atividade.id)
  await notificar(novoResponsavelId, 'ATIVIDADE_TRANSFERIDA', `Você recebeu a atividade "${atividade.titulo}" por transferência (GEP ${gep})`, { demandaId: atividade.demandaId, atividadeId: atividade.id })
  await notificar(atividade.solicitanteId, 'ATIVIDADE_TRANSFERIDA', `Atividade "${atividade.titulo}" foi transferida para ${novoResponsavel.name} (GEP ${gep})`, { demandaId: atividade.demandaId, atividadeId: atividade.id })

  res.json(atualizada)
})

// Deriva o status geral da demanda a partir do conjunto de atividades ativas (não canceladas):
// todas aprovadas -> Concluída; algumas aprovadas e outras ainda em curso -> Parcialmente
// concluída; nenhuma aprovada ainda -> não mexe (mantém EM_ANDAMENTO/ABERTA como está).
// Reavalia mesmo quando a demanda já está Concluída: se uma nova atividade for criada depois
// (ex.: reaberta para outro setor), a demanda deixa de estar 100% concluída e precisa voltar
// a refletir isso (Parcialmente concluída/Em andamento) — do contrário ela fica "presa" como
// Concluída para quem já viu essa etapa, enquanto o setor novo e o administrador ainda têm
// trabalho pendente. Só não mexe em demanda Cancelada (encerramento manual e definitivo).
async function atualizarStatusConformeAtividades(demandaId: string) {
  const demanda = await prisma.demanda.findUnique({ where: { id: demandaId } })
  if (!demanda || demanda.status === 'CANCELADA') return

  const ativas = await prisma.atividade.findMany({ where: { demandaId, status: { not: 'CANCELADA' } } })
  if (ativas.length === 0) return

  const todasAprovadas = ativas.every(a => a.status === 'APROVADA')
  const algumaAprovada = ativas.some(a => a.status === 'APROVADA')

  let novoStatus: string | null = null
  if (todasAprovadas) novoStatus = 'CONCLUIDA'
  else if (algumaAprovada && demanda.status !== 'PARCIALMENTE_CONCLUIDA') novoStatus = 'PARCIALMENTE_CONCLUIDA'
  else if (!algumaAprovada && demanda.status === 'PARCIALMENTE_CONCLUIDA') novoStatus = 'EM_ANDAMENTO'

  if (novoStatus && novoStatus !== demanda.status) {
    await prisma.demanda.update({ where: { id: demandaId }, data: { status: novoStatus as any } })
    const descricao = novoStatus === 'CONCLUIDA'
      ? 'Todas as tarefas ativas foram aprovadas — demanda concluída automaticamente'
      : novoStatus === 'PARCIALMENTE_CONCLUIDA'
        ? 'Parte das tarefas foi aprovada — demanda parcialmente concluída'
        : 'Demanda voltou para em andamento'
    await registrarHistorico(demandaId, demanda.solicitanteId, 'STATUS', descricao)
  }
}

demandasRouter.delete('/atividades/:id', async (req: AuthRequest, res) => {
  const atividade = await prisma.atividade.findUnique({ where: { id: req.params.id } })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)
  if (req.user!.role !== 'MASTER' && atividade.solicitanteId !== req.user!.id) {
    throw new AppError('Somente quem criou a atividade (ou o Master) pode removê-la', 403)
  }
  await prisma.atividade.delete({ where: { id: atividade.id } })
  await registrarHistorico(atividade.demandaId, req.user!.id, 'ATIVIDADE_REMOVIDA', `Atividade "${atividade.titulo}" removida`, atividade.id)
  // Remover a atividade muda o conjunto de "ativas" da demanda — reavalia pra não deixar o
  // status desatualizado (ex.: ficar em Parcialmente concluída quando só resta atividade aprovada).
  await atualizarStatusConformeAtividades(atividade.demandaId)
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

// Mesmo isolamento de processos usado em GET /demandas/:id, aplicado a um documento avulso:
// só quem abriu a demanda, é responsável (usuário/equipe) da atividade dona do documento, ou
// MASTER pode baixar/verificar o arquivo — nunca "qualquer usuário autenticado".
async function assertPodeVerDocumento(req: AuthRequest, documentoId: string) {
  const doc = await prisma.documentoAtividade.findUnique({
    where: { id: documentoId },
    include: { atividade: { include: { demanda: { select: { solicitanteId: true } } } } },
  })
  if (!doc) throw new AppError('Documento não encontrado', 404)
  if (req.user!.role !== 'MASTER' && doc.atividade.demanda.solicitanteId !== req.user!.id) {
    const isResponsavel = await isResponsavelDaAtividade(req.user!.id, doc.atividade)
    if (!isResponsavel) throw new AppError('Você não possui permissão para acessar este conteúdo.', 403)
  }
  return doc
}

// Campo livre de anotações da atividade (o que o responsável achar pertinente registrar,
// além do checklist) — mesma autorização de quem já pode gerenciar o checklist.
demandasRouter.put('/atividades/:id/observacoes', async (req: AuthRequest, res) => {
  const { observacoes } = req.body
  const atividade = await prisma.atividade.findUnique({ where: { id: req.params.id } })
  if (!atividade) throw new AppError('Atividade não encontrada', 404)
  await assertPodeGerenciarChecklist(req, atividade)

  const atualizada = await prisma.atividade.update({
    where: { id: atividade.id },
    data: { observacoes },
  })
  res.json(atualizada)
})

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

  const { concluido, descricao } = req.body
  if (descricao !== undefined && !descricao.trim()) throw new AppError('Descrição do passo é obrigatória')
  const passo = await prisma.passoAtividade.update({
    where: { id: req.params.id },
    data: {
      ...(concluido !== undefined ? { concluido } : {}),
      ...(descricao !== undefined ? { descricao: descricao.trim() } : {}),
    },
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

  await registrarHistorico(atividade.demandaId, req.user!.id, 'DOCUMENTO_ANEXADO', `Documento "${documento.nome}" (v${documento.versao}) anexado à atividade "${atividade.titulo}"`, atividade.id)
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

  await registrarHistorico(atividade.demandaId, req.user!.id, 'DOCUMENTO_ANEXADO', `Arquivo "${documento.nome}" (v${documento.versao}) enviado na atividade "${atividade.titulo}"`, atividade.id)
  res.status(201).json(documento)
})

// Download autenticado (qualquer usuário logado, mesmo modelo de visibilidade das demandas).
// Preferível ao link estático: preserva o nome original no download e não depende de
// adivinhar a rota — mas como /uploads também é servido estaticamente (ver server.ts),
// o nome de arquivo aleatório (UUID) é a camada real de proteção contra acesso não autorizado
// por terceiros, equivalente ao modelo já usado no resto do sistema (link do Google Drive).
demandasRouter.get('/documentos/:id/arquivo', async (req: AuthRequest, res) => {
  const doc = await assertPodeVerDocumento(req, req.params.id)
  if (!doc.arquivoPath) throw new AppError('Arquivo não encontrado', 404)

  const filePath = path.join(UPLOADS_DIR, doc.arquivoPath)
  if (!fs.existsSync(filePath)) throw new AppError('Arquivo não encontrado no armazenamento', 404)

  res.download(filePath, doc.nome + path.extname(doc.arquivoPath))
})

// Recalcula o hash do arquivo em disco agora e compara com o hash salvo no upload.
// Detecta corrupção/alteração do arquivo depois de enviado (integridade real, não só
// confiança cega no armazenamento).
demandasRouter.get('/documentos/:id/verificar-integridade', async (req: AuthRequest, res) => {
  const doc = await assertPodeVerDocumento(req, req.params.id)
  if (!doc.arquivoPath) throw new AppError('Este documento não é um arquivo enviado (é um link)', 400)
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

// Pendências externas são gerenciáveis por qualquer usuário com acesso à demanda (mesmo
// critério do isolamento entre áreas: MASTER, quem abriu, ou responsável de alguma atividade
// dela) — não é uma ação exclusiva de quem abriu o processo.
async function assertPodeGerenciarPendencia(req: AuthRequest, demandaId: string) {
  if (req.user!.role === 'MASTER') return
  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: { solicitanteId: true, atividades: { select: { responsavelId: true, equipeId: true } } },
  })
  if (!demanda) throw new AppError('Demanda não encontrada', 404)
  if (demanda.solicitanteId === req.user!.id) return

  const equipeIds = await getEquipeIdsDoUsuario(req.user!.id)
  const temAcesso = demanda.atividades.some(a => isResponsavelOuEquipeDaAtividade(a, req.user!.id, equipeIds))
  if (!temAcesso) {
    throw new AppError('Você não possui permissão para acessar este conteúdo.', 403)
  }
}

// Quando não sobra nenhuma pendência externa em aberto (AGUARDANDO/COBRADA) para a demanda,
// tira ela de "Aguardando terceiro" automaticamente — mesma lógica inversa de quando a
// primeira pendência é registrada (POST /:demandaId/pendencias já muda para AGUARDANDO_TERCEIRO).
async function reavaliarAguardandoTerceiro(demandaId: string, userId: string) {
  const demanda = await prisma.demanda.findUnique({ where: { id: demandaId } })
  if (!demanda || demanda.status !== 'AGUARDANDO_TERCEIRO') return

  const pendentes = await prisma.pendenciaExterna.count({ where: { demandaId, status: { not: 'RESPONDIDA' } } })
  if (pendentes === 0) {
    await prisma.demanda.update({ where: { id: demandaId }, data: { status: 'EM_ANDAMENTO' } })
    await registrarHistorico(demandaId, userId, 'STATUS', 'Todas as pendências externas foram respondidas — demanda retomada automaticamente')
  }
}

demandasRouter.put('/pendencias/:id', async (req: AuthRequest, res) => {
  const { status, resposta, orgao, descricao, protocolo, prazoEsperado } = req.body
  const pendencia = await prisma.pendenciaExterna.findUnique({ where: { id: req.params.id } })
  if (!pendencia) throw new AppError('Pendência não encontrada', 404)
  await assertPodeGerenciarPendencia(req, pendencia.demandaId)
  if (orgao !== undefined && !orgao.trim()) throw new AppError('Órgão é obrigatório')
  if (descricao !== undefined && !descricao.trim()) throw new AppError('Descrição é obrigatória')

  const atualizada = await prisma.pendenciaExterna.update({
    where: { id: pendencia.id },
    data: {
      ...(status ? { status } : {}),
      ...(resposta !== undefined ? { resposta } : {}),
      ...(orgao !== undefined ? { orgao: orgao.trim() } : {}),
      ...(descricao !== undefined ? { descricao: descricao.trim() } : {}),
      ...(protocolo !== undefined ? { protocolo } : {}),
      ...(prazoEsperado !== undefined ? { prazoEsperado: prazoEsperado ? new Date(prazoEsperado) : null } : {}),
      ...(status === 'COBRADA' ? { ultimaCobranca: new Date() } : {}),
    },
  })

  const descAcao = status ? `status -> ${status}` : 'dados atualizados'
  await registrarHistorico(pendencia.demandaId, req.user!.id, 'PENDENCIA_EXTERNA', `Pendência de ${pendencia.orgao}: ${descAcao}`)

  if (status === 'RESPONDIDA') {
    await reavaliarAguardandoTerceiro(pendencia.demandaId, req.user!.id)
  }

  res.json(atualizada)
})

demandasRouter.delete('/pendencias/:id', async (req: AuthRequest, res) => {
  const pendencia = await prisma.pendenciaExterna.findUnique({ where: { id: req.params.id } })
  if (!pendencia) throw new AppError('Pendência não encontrada', 404)
  await assertPodeGerenciarPendencia(req, pendencia.demandaId)

  await prisma.pendenciaExterna.delete({ where: { id: pendencia.id } })
  await registrarHistorico(pendencia.demandaId, req.user!.id, 'PENDENCIA_EXTERNA', `Pendência de ${pendencia.orgao} removida`)
  await reavaliarAguardandoTerceiro(pendencia.demandaId, req.user!.id)

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

