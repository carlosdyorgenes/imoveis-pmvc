import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { executarBackup, backupEmExecucao } from '../backup/backup'
import { driveConfigurado } from '../backup/drive'

export const backupRouter = Router()
backupRouter.use(authenticate)
backupRouter.use(requireMaster)

backupRouter.get('/status', async (_req: AuthRequest, res) => {
  const execucoes = await prisma.backupExecucao.findMany({ orderBy: { iniciadoEm: 'desc' }, take: 10 })
  res.json({
    driveConfigurado: driveConfigurado(),
    agendadorAtivo: process.env.BACKUP_ATIVO === 'true',
    emExecucao: backupEmExecucao(),
    execucoes,
  })
})

backupRouter.post('/executar', async (_req: AuthRequest, res) => {
  if (backupEmExecucao()) return res.status(409).json({ error: 'Já existe um backup em execução' })
  if (!driveConfigurado()) return res.status(503).json({ error: 'Google Drive não configurado neste servidor' })
  executarBackup('MANUAL').catch(e => console.error('[backup] erro inesperado', e))
  res.status(202).json({ message: 'Backup iniciado em segundo plano — acompanhe em /api/backup/status' })
})
