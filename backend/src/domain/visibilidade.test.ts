import { describe, it, expect } from 'vitest'
import { isResponsavelOuEquipeDaAtividade, filtrarAtividadesVisiveis } from './visibilidade'

describe('isResponsavelOuEquipeDaAtividade', () => {
  it('reconhece o responsável direto', () => {
    expect(isResponsavelOuEquipeDaAtividade({ responsavelId: 'u1', equipeId: null }, 'u1', [])).toBe(true)
  })

  it('reconhece membro da equipe atribuída', () => {
    expect(isResponsavelOuEquipeDaAtividade({ responsavelId: null, equipeId: 'eq1' }, 'u2', ['eq1'])).toBe(true)
  })

  it('nega quando não é responsável nem da equipe', () => {
    expect(isResponsavelOuEquipeDaAtividade({ responsavelId: 'u1', equipeId: 'eq1' }, 'u2', ['eq2'])).toBe(false)
  })

  it('nega quando a atividade não tem equipe e o usuário não é o responsável', () => {
    expect(isResponsavelOuEquipeDaAtividade({ responsavelId: 'u1', equipeId: null }, 'u2', [])).toBe(false)
  })

  it('nega para um colega da MESMA equipe quando já existe um responsável específico — só quem foi escolhido vê', () => {
    expect(isResponsavelOuEquipeDaAtividade({ responsavelId: 'u1', equipeId: 'eq1' }, 'u2', ['eq1'])).toBe(false)
  })
})

describe('filtrarAtividadesVisiveis — isolamento entre áreas', () => {
  const atividades = [
    { id: 'a1', responsavelId: 'jur1', equipeId: 'juridico' },
    { id: 'a2', responsavelId: null, equipeId: 'engenharia' },
    { id: 'a3', responsavelId: 'imob1', equipeId: 'imobiliaria' },
  ]

  it('MASTER/solicitante vê todas as atividades, de todas as áreas', () => {
    const r = filtrarAtividadesVisiveis(atividades, 'qualquer', [], true)
    expect(r.map(a => a.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('usuário de uma área só vê a própria atividade — as outras áreas ficam ocultas', () => {
    const r = filtrarAtividadesVisiveis(atividades, 'jur1', ['juridico'], false)
    expect(r.map(a => a.id)).toEqual(['a1'])
  })

  it('usuário sem nenhuma atividade atribuída não vê nada', () => {
    const r = filtrarAtividadesVisiveis(atividades, 'ninguem', [], false)
    expect(r).toEqual([])
  })

  it('membro de equipe vê a atividade atribuída à equipe mesmo sem responsável individual', () => {
    const r = filtrarAtividadesVisiveis(atividades, 'eng1', ['engenharia'], false)
    expect(r.map(a => a.id)).toEqual(['a2'])
  })
})
