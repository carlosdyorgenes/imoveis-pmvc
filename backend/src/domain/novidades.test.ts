import { describe, it, expect } from 'vitest'
import { montarNovidades } from './novidades'

describe('montarNovidades', () => {
  it('vazio quando nada de novo', () => {
    expect(montarNovidades([], [])).toEqual([])
  })

  it('ordena informações, depois anexos, depois movimentações', () => {
    const r = montarNovidades(
      [
        { acao: 'STATUS', descricao: 'Atividade X passou para Em andamento' },
        { acao: 'INFORMACAO', descricao: 'Cartório confirmou  a matrícula' },
      ],
      [{ nome: 'Parecer', atividadeTitulo: 'Análise', ehAtualizacao: false, resumo: 'Parecer favorável ao registro.' }],
    )
    expect(r[0]).toBe('Informação registrada na linha do tempo: Cartório confirmou a matrícula')
    expect(r[1]).toContain('Novo documento anexado à atividade "Análise"')
    expect(r[2]).toBe('Atividade X passou para Em andamento')
  })

  it('anexo atualizado destaca só o acréscimo e anexo sem resumo é ignorado', () => {
    const r = montarNovidades([], [
      { nome: 'Memorial', atividadeTitulo: 'Planta', ehAtualizacao: true, resumo: 'Inclui confrontação.' },
      { nome: 'Vazio', atividadeTitulo: 'Planta', ehAtualizacao: false, resumo: '  ' },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('Nova versão')
    expect(r[0]).toContain('acréscimos: Inclui confrontação.')
  })

  it('descarta repetições e limita o tamanho', () => {
    const rep = Array.from({ length: 40 }, (_, i) => ({ acao: 'X', descricao: `Evento ${i}` }))
    expect(montarNovidades([...rep, ...rep], [])).toHaveLength(25)
    const longo = montarNovidades([{ acao: 'INFORMACAO', descricao: 'a'.repeat(1000) }], [])
    expect(longo[0].length).toBeLessThan(400)
  })
})
