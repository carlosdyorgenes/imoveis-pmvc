import { describe, it, expect } from 'vitest'
import { resolverBase, houveAtualizacao, CacheDoPeriodo } from './periodoRelatorio'

const dia = (d: Date) => d.toISOString().slice(0, 10)
const cacheBase = (extra: Partial<CacheDoPeriodo> = {}): CacheDoPeriodo => ({
  assinatura: 'S1', assinaturaAnexos: 'A1', atualizadoEm: new Date('2026-10-23T13:00:00Z'),
  baseAssinatura: 'S0', baseAssinaturaAnexos: 'A0', baseEm: new Date('2026-10-17T21:00:00Z'), ...extra,
})

describe('resolverBase', () => {
  it('demanda sem relatório anterior sempre aparece como atualizada', () => {
    const base = resolverBase(null, '2026-10-23', dia)
    expect(base.precisaGravar).toBe(true)
    expect(houveAtualizacao(base, { assinatura: 'X', anexos: '' })).toBe(true)
  })

  it('no mesmo dia mantém a base (gerar de novo não perde atualizações)', () => {
    const base = resolverBase(cacheBase(), '2026-10-23', dia)
    expect(base).toEqual({ assinatura: 'S0', anexos: 'A0', em: new Date('2026-10-17T21:00:00Z'), precisaGravar: false })
    expect(houveAtualizacao(base, { assinatura: 'S1', anexos: 'A1' })).toBe(true)
  })

  it('em um novo dia a base avança para o estado da última geração', () => {
    const base = resolverBase(cacheBase(), '2026-10-24', dia)
    expect(base.assinatura).toBe('S1')
    expect(base.em).toEqual(new Date('2026-10-23T13:00:00Z'))
    expect(base.precisaGravar).toBe(true)
    expect(houveAtualizacao(base, { assinatura: 'S1', anexos: 'A1' })).toBe(false)
  })

  it('linha sem base gravada usa o estado atual do cache como base', () => {
    const base = resolverBase(cacheBase({ baseAssinatura: null, baseAssinaturaAnexos: null, baseEm: null }), '2026-10-23', dia)
    expect(base.assinatura).toBe('S1')
    expect(base.precisaGravar).toBe(true)
  })
})

describe('houveAtualizacao', () => {
  const base = { assinatura: 'S', anexos: 'A', em: null, precisaGravar: false }
  it('igual = sem atualização', () => expect(houveAtualizacao(base, { assinatura: 'S', anexos: 'A' })).toBe(false))
  it('texto mudou = atualizada', () => expect(houveAtualizacao(base, { assinatura: 'T', anexos: 'A' })).toBe(true))
  it('anexo novo = atualizada', () => expect(houveAtualizacao(base, { assinatura: 'S', anexos: 'B' })).toBe(true))
  it('base sem controle de anexos ignora diferença de anexos', () => {
    expect(houveAtualizacao({ ...base, anexos: null }, { assinatura: 'S', anexos: 'B' })).toBe(false)
  })
})
