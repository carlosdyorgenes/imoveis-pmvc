// Motor de fluxo com paralelismo real: etapas de um ModeloEtapa que compartilham o mesmo
// `ordem` formam um "grupo paralelo" — todas nascem juntas como atividades, e o fluxo só
// avança para o próximo grupo quando TODAS as etapas do grupo atual estiverem aprovadas
// (semântica de "join"). Modelos com uma etapa por ordem (o caso comum) continuam
// estritamente sequenciais, sem nenhuma mudança de comportamento.

export interface EtapaModelo {
  id: string
  ordem: number
}

// Retorna todas as etapas do modelo que pertencem ao mesmo grupo (mesmo `ordem`) de uma etapa dada.
export function etapasDoMesmoGrupo(etapas: EtapaModelo[], etapaId: string): EtapaModelo[] {
  const etapa = etapas.find(e => e.id === etapaId)
  if (!etapa) return []
  return etapas.filter(e => e.ordem === etapa.ordem)
}

// Retorna as etapas do próximo grupo (menor `ordem` estritamente maior que a atual), ou [] se não houver.
export function proximoGrupo(etapas: EtapaModelo[], ordemAtual: number): EtapaModelo[] {
  const ordens = [...new Set(etapas.map(e => e.ordem))].filter(o => o > ordemAtual).sort((a, b) => a - b)
  if (ordens.length === 0) return []
  const proximaOrdem = ordens[0]
  return etapas.filter(e => e.ordem === proximaOrdem)
}

// Dado o grupo de etapas atual e o conjunto de modeloEtapaId já aprovados para esta demanda,
// diz se o grupo está completo (todas as etapas do grupo foram aprovadas) — condição para
// liberar o próximo grupo ou concluir a demanda.
export function grupoCompleto(grupo: EtapaModelo[], modeloEtapaIdsAprovados: Set<string>): boolean {
  return grupo.length > 0 && grupo.every(e => modeloEtapaIdsAprovados.has(e.id))
}
