import { prisma } from '../lib/prisma'

export async function notificar(
  userId: string,
  tipo: string,
  mensagem: string,
  opts: { demandaId?: string; atividadeId?: string } = {}
) {
  await prisma.notificacao.create({
    data: { userId, tipo, mensagem, demandaId: opts.demandaId, atividadeId: opts.atividadeId },
  }).catch(console.error)
}
