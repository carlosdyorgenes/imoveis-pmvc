// Isolamento entre usuários da mesma equipe: a distribuição automática (ver
// domain/balanceamento.ts) sempre escolhe UM responsável específico — a partir daí, só essa
// pessoa enxerga/age na atividade, mesmo os colegas de equipe dela não veem. equipeId continua
// gravado (para o rótulo "Equipe: X" e para restringir a quem "Transferir tarefa" pode escolher),
// mas só entra na conta de visibilidade no caso raro de a atividade não ter responsável definido
// (ex.: dado legado). Quem abriu a demanda (solicitante) e o MASTER sempre veem tudo.
export interface AtividadeVisibilidade {
  responsavelId: string | null
  equipeId: string | null
}

export function isResponsavelOuEquipeDaAtividade(atividade: AtividadeVisibilidade, userId: string, equipeIds: string[]): boolean {
  if (atividade.responsavelId) return atividade.responsavelId === userId
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
