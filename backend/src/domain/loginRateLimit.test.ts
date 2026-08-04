import { describe, it, expect } from 'vitest'
import { novoEstado, verificarBloqueio, registrarFalha, registrarSucesso, MAX_TENTATIVAS, JANELA_MS, BLOQUEIO_MS } from './loginRateLimit'

describe('limite de tentativas de login', () => {
  it('não bloqueia um estado novo', () => {
    const r = verificarBloqueio(novoEstado(), Date.now())
    expect(r.bloqueado).toBe(false)
  })

  it('bloqueia após atingir o número máximo de falhas na janela', () => {
    let estado = novoEstado()
    const agora = Date.now()
    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      estado = registrarFalha(estado, agora + i)
    }
    const r = verificarBloqueio(estado, agora + MAX_TENTATIVAS)
    expect(r.bloqueado).toBe(true)
    expect(r.segundosRestantes).toBeGreaterThan(0)
  })

  it('não bloqueia com menos falhas que o máximo', () => {
    let estado = novoEstado()
    const agora = Date.now()
    for (let i = 0; i < MAX_TENTATIVAS - 1; i++) {
      estado = registrarFalha(estado, agora + i)
    }
    expect(verificarBloqueio(estado, agora + MAX_TENTATIVAS).bloqueado).toBe(false)
  })

  it('libera o bloqueio depois do tempo de bloqueio passar', () => {
    let estado = novoEstado()
    const agora = Date.now()
    for (let i = 0; i < MAX_TENTATIVAS; i++) estado = registrarFalha(estado, agora)
    expect(verificarBloqueio(estado, agora + BLOQUEIO_MS + 1).bloqueado).toBe(false)
  })

  it('falhas fora da janela não contam para o bloqueio', () => {
    let estado = novoEstado()
    const agora = Date.now()
    for (let i = 0; i < MAX_TENTATIVAS - 1; i++) estado = registrarFalha(estado, agora)
    // uma falha antiga, fora da janela, não deve somar com as novas
    estado = registrarFalha(estado, agora - JANELA_MS - 1000)
    expect(verificarBloqueio(estado, agora).bloqueado).toBe(false)
  })

  it('login bem-sucedido reseta o contador', () => {
    const estado = registrarSucesso()
    expect(estado.falhas).toEqual([])
    expect(estado.bloqueadoAte).toBeNull()
  })
})
