import { describe, it, expect } from 'vitest'
import { montarNovidades } from './novidades'

describe('montarNovidades', () => {
  it('vazio quando nada de novo', () => {
    expect(montarNovidades([], [])).toEqual({ informacoes: [], demais: [] })
  })

  it('separa informações (texto completo) de anexos e movimentações', () => {
    const r = montarNovidades(
      [
        { acao: 'STATUS', descricao: 'Atividade X passou para Em andamento' },
        { acao: 'INFORMACAO', descricao: 'Cartório confirmou  a matrícula\ne pediu complemento.' },
      ],
      [{ nome: 'Parecer', atividadeTitulo: 'Análise', ehAtualizacao: false, resumo: 'Parecer favorável ao registro.' }],
    )
    expect(r.informacoes).toEqual(['Cartório confirmou a matrícula e pediu complemento.'])
    expect(r.demais[0]).toContain('Novo documento anexado à atividade "Análise"')
    expect(r.demais[1]).toBe('Atividade X passou para Em andamento')
  })

  it('a informação nunca é cortada, mesmo longa', () => {
    const longa = 'palavra '.repeat(300).trim()
    expect(montarNovidades([{ acao: 'INFORMACAO', descricao: longa }], []).informacoes[0]).toBe(longa)
  })

  it('anexo atualizado destaca só o acréscimo e anexo sem resumo é ignorado', () => {
    const r = montarNovidades([], [
      { nome: 'Memorial', atividadeTitulo: 'Planta', ehAtualizacao: true, resumo: 'Inclui confrontação.' },
      { nome: 'Vazio', atividadeTitulo: 'Planta', ehAtualizacao: false, resumo: '  ' },
    ])
    expect(r.demais).toHaveLength(1)
    expect(r.demais[0]).toContain('acréscimos: Inclui confrontação.')
  })

  it('descarta repetições e limita as movimentações', () => {
    const rep = Array.from({ length: 40 }, (_, i) => ({ acao: 'X', descricao: `Evento ${i}` }))
    expect(montarNovidades([...rep, ...rep], []).demais).toHaveLength(25)
  })
})
