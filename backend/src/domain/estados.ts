// Máquinas de estado do módulo de Demandas — extraídas para módulo puro e testável.
// Nenhuma transição de status pode ocorrer fora destas tabelas (Etapa 8/9 do escopo original).

export const TRANSICOES_DEMANDA: Record<string, string[]> = {
  ABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['PARCIALMENTE_CONCLUIDA', 'AGUARDANDO_TERCEIRO', 'DEVOLVIDA', 'CONCLUIDA', 'CANCELADA'],
  PARCIALMENTE_CONCLUIDA: ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO', 'CONCLUIDA', 'CANCELADA'],
  AGUARDANDO_TERCEIRO: ['EM_ANDAMENTO', 'CANCELADA'],
  DEVOLVIDA: ['EM_ANDAMENTO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
}

// TRANSFERIDA não é um estado de repouso: transferir só troca o responsável (ver rota
// /atividades/:id/transferir) e fica registrado em HistoricoTransferencia + no histórico da
// demanda — o status corrente (ATRIBUIDA, EM_ANDAMENTO, etc.) não muda com a transferência.
export const TRANSICOES_ATIVIDADE: Record<string, string[]> = {
  ATRIBUIDA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'AGUARDANDO_INFORMACAO', 'CANCELADA'],
  AGUARDANDO_INFORMACAO: ['EM_ANDAMENTO', 'CANCELADA'],
  CONCLUIDA: ['APROVADA', 'DEVOLVIDA'],
  DEVOLVIDA: ['EM_ANDAMENTO', 'CANCELADA'],
  APROVADA: ['REABERTA'],
  REABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  CANCELADA: [],
}

export function transicaoValida(tabela: Record<string, string[]>, statusAtual: string, statusNovo: string): boolean {
  const permitido = tabela[statusAtual] || []
  return permitido.includes(statusNovo)
}

// Ações da atividade e quem pode executá-las (usadas pela camada de autorização das rotas)
export const AÇÕES_DO_RESPONSAVEL = ['EM_ANDAMENTO', 'CONCLUIDA']
export const AÇÕES_DO_SOLICITANTE = ['APROVADA', 'DEVOLVIDA']
