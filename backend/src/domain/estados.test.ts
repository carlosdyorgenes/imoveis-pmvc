import { describe, it, expect } from 'vitest'
import { TRANSICOES_DEMANDA, TRANSICOES_ATIVIDADE, transicaoValida, AÇÕES_DO_RESPONSAVEL, AÇÕES_DO_SOLICITANTE } from './estados'

describe('máquina de estados — Demanda', () => {
  it('permite ABERTA -> EM_ANDAMENTO', () => {
    expect(transicaoValida(TRANSICOES_DEMANDA, 'ABERTA', 'EM_ANDAMENTO')).toBe(true)
  })

  it('bloqueia ABERTA -> CONCLUIDA (pulo de etapas)', () => {
    expect(transicaoValida(TRANSICOES_DEMANDA, 'ABERTA', 'CONCLUIDA')).toBe(false)
  })

  it('bloqueia qualquer transição a partir de CONCLUIDA (estado final)', () => {
    expect(transicaoValida(TRANSICOES_DEMANDA, 'CONCLUIDA', 'EM_ANDAMENTO')).toBe(false)
    expect(transicaoValida(TRANSICOES_DEMANDA, 'CONCLUIDA', 'ABERTA')).toBe(false)
  })

  it('bloqueia qualquer transição a partir de CANCELADA (estado final)', () => {
    expect(transicaoValida(TRANSICOES_DEMANDA, 'CANCELADA', 'EM_ANDAMENTO')).toBe(false)
  })

  it('permite retomar de AGUARDANDO_TERCEIRO para EM_ANDAMENTO', () => {
    expect(transicaoValida(TRANSICOES_DEMANDA, 'AGUARDANDO_TERCEIRO', 'EM_ANDAMENTO')).toBe(true)
  })

  it('permite EM_ANDAMENTO -> PARCIALMENTE_CONCLUIDA quando só parte das tarefas termina', () => {
    expect(transicaoValida(TRANSICOES_DEMANDA, 'EM_ANDAMENTO', 'PARCIALMENTE_CONCLUIDA')).toBe(true)
  })

  it('permite PARCIALMENTE_CONCLUIDA -> CONCLUIDA quando o restante termina', () => {
    expect(transicaoValida(TRANSICOES_DEMANDA, 'PARCIALMENTE_CONCLUIDA', 'CONCLUIDA')).toBe(true)
  })
})

describe('máquina de estados — Atividade', () => {
  it('permite ciclo completo: ATRIBUIDA -> EM_ANDAMENTO -> CONCLUIDA -> APROVADA', () => {
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'ATRIBUIDA', 'EM_ANDAMENTO')).toBe(true)
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'EM_ANDAMENTO', 'CONCLUIDA')).toBe(true)
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'CONCLUIDA', 'APROVADA')).toBe(true)
  })

  it('permite devolução e correção: CONCLUIDA -> DEVOLVIDA -> EM_ANDAMENTO -> CONCLUIDA', () => {
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'CONCLUIDA', 'DEVOLVIDA')).toBe(true)
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'DEVOLVIDA', 'EM_ANDAMENTO')).toBe(true)
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'EM_ANDAMENTO', 'CONCLUIDA')).toBe(true)
  })

  it('bloqueia pular direto de ATRIBUIDA para CONCLUIDA', () => {
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'ATRIBUIDA', 'CONCLUIDA')).toBe(false)
  })

  it('bloqueia voltar direto de APROVADA para EM_ANDAMENTO (precisa reabrir primeiro)', () => {
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'APROVADA', 'EM_ANDAMENTO')).toBe(false)
  })

  it('permite reabertura de uma atividade aprovada, mediante justificativa (REABERTA)', () => {
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'APROVADA', 'REABERTA')).toBe(true)
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'REABERTA', 'EM_ANDAMENTO')).toBe(true)
  })

  it('permite marcar como aguardando informação e depois retomar', () => {
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO')).toBe(true)
    expect(transicaoValida(TRANSICOES_ATIVIDADE, 'AGUARDANDO_INFORMACAO', 'EM_ANDAMENTO')).toBe(true)
  })

  it('define corretamente quais status são ações do responsável vs do solicitante', () => {
    expect(AÇÕES_DO_RESPONSAVEL).toEqual(['EM_ANDAMENTO', 'CONCLUIDA'])
    expect(AÇÕES_DO_SOLICITANTE).toEqual(['APROVADA', 'DEVOLVIDA'])
    // Nenhuma ação deve pertencer aos dois grupos ao mesmo tempo (evita ambiguidade de autorização)
    const intersecao = AÇÕES_DO_RESPONSAVEL.filter(a => AÇÕES_DO_SOLICITANTE.includes(a))
    expect(intersecao).toEqual([])
  })
})
