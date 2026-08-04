import { describe, it, expect } from 'vitest'
import { formatarDuracao, calcularTemposAtividade } from './tempos'

describe('formatarDuracao', () => {
  it('formata minutos simples', () => {
    const r = formatarDuracao(0, 30 * 60000)
    expect(r.minutos).toBe(30)
    expect(r.texto).toBe('30min')
  })

  it('formata horas e minutos', () => {
    const r = formatarDuracao(0, (2 * 60 + 15) * 60000)
    expect(r.texto).toBe('2h 15min')
  })

  it('formata dias, horas e minutos', () => {
    const r = formatarDuracao(0, (2 * 1440 + 3 * 60 + 5) * 60000)
    expect(r.texto).toBe('2d 3h 5min')
  })

  it('nunca retorna duração negativa', () => {
    const r = formatarDuracao(60000, 0)
    expect(r.minutos).toBe(0)
  })
})

describe('calcularTemposAtividade', () => {
  const createdAt = new Date('2026-01-01T08:00:00Z')

  it('tempo de espera cresce até agora quando ainda não iniciada', () => {
    const agora = new Date('2026-01-01T10:00:00Z')
    const r = calcularTemposAtividade(createdAt, null, null, agora)
    expect(r.tempoEspera.minutos).toBe(120)
    expect(r.tempoExecucao).toBeNull()
  })

  it('tempo de execução calculado quando iniciada mas não concluída', () => {
    const dataInicio = new Date('2026-01-01T09:00:00Z')
    const agora = new Date('2026-01-01T09:30:00Z')
    const r = calcularTemposAtividade(createdAt, dataInicio, null, agora)
    expect(r.tempoEspera.minutos).toBe(60)
    expect(r.tempoExecucao?.minutos).toBe(30)
    expect(r.tempoTotal.minutos).toBe(90)
  })

  it('tempo total = espera + execução quando concluída', () => {
    const dataInicio = new Date('2026-01-01T09:00:00Z')
    const dataConclusao = new Date('2026-01-01T11:00:00Z')
    const r = calcularTemposAtividade(createdAt, dataInicio, dataConclusao)
    expect(r.tempoEspera.minutos).toBe(60)
    expect(r.tempoExecucao?.minutos).toBe(120)
    expect(r.tempoTotal.minutos).toBe(180)
  })
})
