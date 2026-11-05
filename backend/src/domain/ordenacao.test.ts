import { describe, it, expect } from 'vitest'
import { concluidasPorUltimo } from './ordenacao'

describe('concluidasPorUltimo', () => {
  it('manda as concluídas para o fim e preserva a ordem de cada grupo', () => {
    const lista = [
      { id: 1, status: 'CONCLUIDA' },
      { id: 2, status: 'EM_ANDAMENTO' },
      { id: 3, status: 'CONCLUIDA' },
      { id: 4, status: 'ABERTA' },
      { id: 5, status: 'CANCELADA' },
    ]
    expect(concluidasPorUltimo(lista).map(d => d.id)).toEqual([2, 4, 5, 1, 3])
  })
  it('não altera a lista original e aceita lista vazia', () => {
    const lista = [{ status: 'CONCLUIDA' }, { status: 'ABERTA' }]
    concluidasPorUltimo(lista)
    expect(lista[0].status).toBe('CONCLUIDA')
    expect(concluidasPorUltimo([])).toEqual([])
  })
})
