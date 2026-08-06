// Distribuição automática por equipe: ao atribuir uma atividade a uma equipe, o sistema
// escolhe sozinho qual membro vai receber, sem o solicitante precisar escolher a pessoa —
// sempre quem tiver menos atividades ativas no momento (fila mais vazia primeiro).

export interface MembroCarga {
  userId: string
  ativas: number
}

// Entre os membros informados, retorna o userId com menor número de atividades ativas.
// Em empate, mantém a ordem de entrada (primeiro da lista de membros da equipe).
export function escolherResponsavelComMenorCarga(membros: MembroCarga[]): string | null {
  if (membros.length === 0) return null
  return membros.reduce((menor, atual) => (atual.ativas < menor.ativas ? atual : menor)).userId
}
