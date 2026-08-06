import { describe, it, expect } from 'vitest'
import { escolherResponsavelComMenorCarga } from './balanceamento'

describe('escolherResponsavelComMenorCarga', () => {
  it('escolhe quem tem menos atividades ativas', () => {
    const r = escolherResponsavelComMenorCarga([
      { userId: 'a', ativas: 3 },
      { userId: 'b', ativas: 1 },
      { userId: 'c', ativas: 5 },
    ])
    expect(r).toBe('b')
  })

  it('em empate, mantém o primeiro da lista', () => {
    const r = escolherResponsavelComMenorCarga([
      { userId: 'a', ativas: 2 },
      { userId: 'b', ativas: 2 },
    ])
    expect(r).toBe('a')
  })

  it('funciona com um único membro', () => {
    expect(escolherResponsavelComMenorCarga([{ userId: 'a', ativas: 7 }])).toBe('a')
  })

  it('retorna null quando não há membros', () => {
    expect(escolherResponsavelComMenorCarga([])).toBeNull()
  })

  it('escolhe quem tem zero atividades entre vários com carga', () => {
    const r = escolherResponsavelComMenorCarga([
      { userId: 'a', ativas: 4 },
      { userId: 'b', ativas: 0 },
      { userId: 'c', ativas: 2 },
    ])
    expect(r).toBe('b')
  })
})
