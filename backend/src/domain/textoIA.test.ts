import { describe, it, expect } from 'vitest'
import { textoPareceCortado } from './textoIA'

describe('textoPareceCortado', () => {
  it('texto terminado em pontuação está completo', () => {
    expect(textoPareceCortado('A atividade foi concluída.')).toBe(false)
    expect(textoPareceCortado('Concluída (ver anexo)  ')).toBe(false)
    expect(textoPareceCortado('Ele disse "sim"')).toBe(false)
  })
  it('texto interrompido no meio da frase é cortado', () => {
    expect(textoPareceCortado('Atualmente, a dem')).toBe(true)
    expect(textoPareceCortado('Atualmente, a atividade encontra-se em andamento,')).toBe(true)
  })
  it('vazio não é considerado cortado', () => {
    expect(textoPareceCortado('')).toBe(false)
    expect(textoPareceCortado(null)).toBe(false)
  })
})
