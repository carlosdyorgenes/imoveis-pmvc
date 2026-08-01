import { describe, it, expect } from 'vitest'
import { etapasDoMesmoGrupo, proximoGrupo, grupoCompleto } from './motorFluxo'

const etapasSequenciais = [
  { id: 'A', ordem: 0 },
  { id: 'B', ordem: 1 },
  { id: 'C', ordem: 2 },
]

const etapasComParalelismo = [
  { id: 'A', ordem: 0 },
  { id: 'B1', ordem: 1 },
  { id: 'B2', ordem: 1 }, // paralela a B1
  { id: 'C', ordem: 2 },
]

describe('motorFluxo — comportamento sequencial (retrocompatibilidade)', () => {
  it('cada etapa sequencial forma um grupo de um único elemento', () => {
    expect(etapasDoMesmoGrupo(etapasSequenciais, 'B')).toEqual([{ id: 'B', ordem: 1 }])
  })

  it('próximo grupo de uma etapa sequencial é a próxima etapa, sozinha', () => {
    expect(proximoGrupo(etapasSequenciais, 0)).toEqual([{ id: 'B', ordem: 1 }])
  })

  it('grupo sequencial de 1 etapa está completo assim que ela é aprovada', () => {
    const grupo = [{ id: 'B', ordem: 1 }]
    expect(grupoCompleto(grupo, new Set(['B']))).toBe(true)
    expect(grupoCompleto(grupo, new Set())).toBe(false)
  })

  it('não há próximo grupo depois da última etapa', () => {
    expect(proximoGrupo(etapasSequenciais, 2)).toEqual([])
  })
})

describe('motorFluxo — paralelismo real', () => {
  it('B1 e B2 (mesmo ordem) formam um grupo de duas etapas', () => {
    const grupo = etapasDoMesmoGrupo(etapasComParalelismo, 'B1')
    expect(grupo.map(e => e.id).sort()).toEqual(['B1', 'B2'])
  })

  it('próximo grupo após A é [B1, B2] juntas', () => {
    const grupo = proximoGrupo(etapasComParalelismo, 0)
    expect(grupo.map(e => e.id).sort()).toEqual(['B1', 'B2'])
  })

  it('grupo paralelo NÃO está completo enquanto só uma das etapas foi aprovada', () => {
    const grupo = etapasDoMesmoGrupo(etapasComParalelismo, 'B1')
    expect(grupoCompleto(grupo, new Set(['B1']))).toBe(false)
    expect(grupoCompleto(grupo, new Set(['B2']))).toBe(false)
  })

  it('grupo paralelo está completo quando AMBAS as etapas foram aprovadas', () => {
    const grupo = etapasDoMesmoGrupo(etapasComParalelismo, 'B1')
    expect(grupoCompleto(grupo, new Set(['B1', 'B2']))).toBe(true)
  })

  it('próximo grupo após [B1,B2] é C, sozinha', () => {
    expect(proximoGrupo(etapasComParalelismo, 1)).toEqual([{ id: 'C', ordem: 2 }])
  })
})
