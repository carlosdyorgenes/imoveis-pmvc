// Visibilidade por equipe (não mais por indivíduo): a distribuição automática (ver
// domain/balanceamento.ts) ainda escolhe UM responsável específico — usado pra saber de quem
// é a "vez" de tocar a tarefa e pra quem a notificação de nova atividade vai — mas qualquer
// membro da mesma equipe também enxerga e pode agir na atividade (tela "Demandas"). O
// isolamento estrito por indivíduo continua só na fila pessoal ("Minha Fila"), que filtra por
// responsavelId em vez de usar esta função. Quem abriu a demanda (solicitante) e o MASTER
// sempre veem tudo.
export interface AtividadeVisibilidade {
  responsavelId: string | null
  equipeId: string | null
}

export function isResponsavelOuEquipeDaAtividade(atividade: AtividadeVisibilidade, userId: string, equipeIds: string[]): boolean {
  if (atividade.responsavelId === userId) return true
  return !!atividade.equipeId && equipeIds.includes(atividade.equipeId)
}

// Filtra as atividades de uma demanda conforme quem está pedindo: MASTER e o solicitante veem
// tudo; qualquer outro usuário só vê as atividades das quais é responsável (direto ou via equipe).
export function filtrarAtividadesVisiveis<T extends AtividadeVisibilidade>(
  atividades: T[],
  userId: string,
  equipeIds: string[],
  isMasterOuSolicitante: boolean
): T[] {
  if (isMasterOuSolicitante) return atividades
  return atividades.filter(a => isResponsavelOuEquipeDaAtividade(a, userId, equipeIds))
}
