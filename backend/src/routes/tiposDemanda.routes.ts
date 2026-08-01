import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requirePermissao, AuthRequest } from '../middleware/auth'
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

tiposDemandaRouter.post('/', requirePermissao('tipos_demanda.gerenciar'), async (req: AuthRequest, res) => {
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

tiposDemandaRouter.put('/:id', requirePermissao('tipos_demanda.gerenciar'), async (req: AuthRequest, res) => {
  const { nome, descricao, prazoPadraoDias, ativo } = req.body
  const tipo = await prisma.tipoDemanda.update({
    where: { id: req.params.id },
    data: { nome, descricao, prazoPadraoDias: prazoPadraoDias ? Number(prazoPadraoDias) : null, ativo },
    include: TIPO_INCLUDE,
  })
  res.json(tipo)
})

tiposDemandaRouter.delete('/:id', requirePermissao('tipos_demanda.gerenciar'), async (req: AuthRequest, res) => {
  await prisma.tipoDemanda.delete({ where: { id: req.params.id } })
  res.json({ message: 'Tipo de demanda removido' })
})

// ===== Etapas do modelo (motor de fluxo configurável) =====

// `paraleloComEtapaId`: se informado, a nova etapa recebe o MESMO `ordem` da etapa indicada,
// tornando-as um grupo paralelo (ambas nascem juntas e o fluxo só avança quando as duas forem
// aprovadas). Sem esse campo, a etapa é anexada ao final da sequência (comportamento padrão).
tiposDemandaRouter.post('/:tipoId/etapas', requirePermissao('tipos_demanda.gerenciar'), async (req: AuthRequest, res) => {
  const { titulo, instrucoes, equipeId, prazoDias, paraleloComEtapaId } = req.body
  if (!titulo?.trim()) throw new AppError('Título da etapa é obrigatório')

  const tipo = await prisma.tipoDemanda.findUnique({ where: { id: req.params.tipoId } })
  if (!tipo) throw new AppError('Tipo de demanda não encontrado', 404)

  let ordem: number
  if (paraleloComEtapaId) {
    const etapaIrma = await prisma.modeloEtapa.findUnique({ where: { id: paraleloComEtapaId } })
    if (!etapaIrma || etapaIrma.tipoDemandaId !== tipo.id) throw new AppError('Etapa paralela inválida')
    ordem = etapaIrma.ordem
  } else {
    const maiorOrdem = await prisma.modeloEtapa.aggregate({ where: { tipoDemandaId: tipo.id }, _max: { ordem: true } })
    ordem = (maiorOrdem._max.ordem ?? -1) + 1
  }

  const etapa = await prisma.modeloEtapa.create({
    data: {
      tipoDemandaId: tipo.id,
      titulo: titulo.trim(),
      instrucoes,
      equipeId: equipeId || null,
      prazoDias: prazoDias ? Number(prazoDias) : null,
      ordem,
    },
  })
  res.status(201).json(etapa)
})

tiposDemandaRouter.delete('/etapas/:id', requirePermissao('tipos_demanda.gerenciar'), async (req: AuthRequest, res) => {
  await prisma.modeloEtapa.delete({ where: { id: req.params.id } })
  res.json({ message: 'Etapa do modelo removida' })
})
