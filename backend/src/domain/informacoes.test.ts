import { describe, it, expect } from 'vitest'
import { formatarSecaoInformacoes } from './informacoes'

describe('formatarSecaoInformacoes', () => {
  it('vazio sem informações', () => {
    expect(formatarSecaoInformacoes([])).toBe('')
    expect(formatarSecaoInformacoes(['  ', ''])).toBe('')
  })
  it('lista cada informação em uma linha, sem quebras internas', () => {
    const s = formatarSecaoInformacoes(['Contato com o cartório\nfeito por telefone', 'Matrícula localizada'])
    expect(s).toContain('INFORMAÇÕES COMPLEMENTARES')
    expect(s).toContain('- Contato com o cartório feito por telefone')
    expect(s).toContain('- Matrícula localizada')
  })
})
