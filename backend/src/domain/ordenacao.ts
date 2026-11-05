// Listagem de demandas: as concluídas vão para o fim, sem misturar com as demais. Cada grupo
// mantém a ordem em que já vinha (ordenação estável).
export function concluidasPorUltimo<T extends { status: string }>(lista: T[]): T[] {
  return [...lista.filter(d => d.status !== 'CONCLUIDA'), ...lista.filter(d => d.status === 'CONCLUIDA')]
}
