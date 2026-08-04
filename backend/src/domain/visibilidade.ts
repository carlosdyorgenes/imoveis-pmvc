// Isolamento de processos entre áreas (Seção 28): um usuário PADRAO só deve enxergar uma
// atividade se for responsável direto dela ou membro da equipe à qual ela foi atribuída.
// Quem abriu a demanda (solicitante) e o MASTER enxergam todas as atividades, pois precisam
// distribuir/analisar o processo inteiro — a restrição vale só para usuários de setor.

export interface AtividadeVisibilidade {
  responsavelId: string | null
  equipeId: string | null
}

export function isResponsavelOuEquipeDaAtividade(atividade: AtividadeVisibilidade, userId: string, equipeIds: string[]): boolean {
  return atividade.responsavelId === userId || (!!atividade.equipeId && equipeIds.includes(atividade.equipeId))
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
