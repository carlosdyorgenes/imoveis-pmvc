// Limite de tentativas de login — lógica pura e testável, independente de armazenamento.
// Janela deslizante simples: N tentativas falhas dentro de WINDOW_MS bloqueiam por BLOCK_MS.
// A instância roda em uma única máquina Fly.io (sem infra de cache compartilhado), então o
// estado fica em memória; isso é aceitável aqui pois o objetivo é mitigar força bruta
// automatizada, não substituir um WAF.

export const MAX_TENTATIVAS = 5
export const JANELA_MS = 15 * 60 * 1000 // 15 minutos
export const BLOQUEIO_MS = 15 * 60 * 1000 // 15 minutos

export interface EstadoTentativas {
  falhas: number[] // timestamps (ms) das falhas dentro da janela
  bloqueadoAte: number | null
}

export function novoEstado(): EstadoTentativas {
  return { falhas: [], bloqueadoAte: null }
}

export function verificarBloqueio(estado: EstadoTentativas, agora: number): { bloqueado: boolean; segundosRestantes: number } {
  if (estado.bloqueadoAte && estado.bloqueadoAte > agora) {
    return { bloqueado: true, segundosRestantes: Math.ceil((estado.bloqueadoAte - agora) / 1000) }
  }
  return { bloqueado: false, segundosRestantes: 0 }
}

export function registrarFalha(estado: EstadoTentativas, agora: number): EstadoTentativas {
  const falhasNaJanela = [...estado.falhas.filter(t => agora - t < JANELA_MS), agora]
  const bloqueadoAte = falhasNaJanela.length >= MAX_TENTATIVAS ? agora + BLOQUEIO_MS : estado.bloqueadoAte
  return { falhas: falhasNaJanela, bloqueadoAte }
}

export function registrarSucesso(): EstadoTentativas {
  return novoEstado()
}
