import { prisma } from '../lib/prisma'

interface LogData {
  userId?: string
  action: string
  entity: string
  entityId?: string
  details?: string
  ip?: string
}

export async function createLog(data: LogData) {
  await prisma.log.create({ data }).catch(console.error)
}
