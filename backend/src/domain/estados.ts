// Máquinas de estado do módulo de Demandas — extraídas para módulo puro e testável.
// Nenhuma transição de status pode ocorrer fora destas tabelas (Etapa 8/9 do escopo original).

export const TRANSICOES_DEMANDA: Record<string, string[]> = {
  ABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['AGUARDANDO_TERCEIRO', 'DEVOLVIDA', 'CONCLUIDA', 'CANCELADA'],
  AGUARDANDO_TERCEIRO: ['EM_ANDAMENTO', 'CANCELADA'],
  DEVOLVIDA: ['EM_ANDAMENTO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
}

export const TRANSICOES_ATIVIDADE: Record<string, string[]> = {
  ATRIBUIDA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: ['APROVADA', 'DEVOLVIDA'],
  DEVOLVIDA: ['EM_ANDAMENTO', 'CANCELADA'],
  APROVADA: [],
  CANCELADA: [],
}

export function transicaoValida(tabela: Record<string, string[]>, statusAtual: string, statusNovo: string): boolean {
  const permitido = tabela[statusAtual] || []
  return permitido.includes(statusNovo)
}

// Ações da atividade e quem pode executá-las (usadas pela camada de autorização das rotas)
export const AÇÕES_DO_RESPONSAVEL = ['EM_ANDAMENTO', 'CONCLUIDA']
export const AÇÕES_DO_SOLICITANTE = ['APROVADA', 'DEVOLVIDA']
