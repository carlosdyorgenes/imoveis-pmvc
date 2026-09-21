import { describe, it, expect, vi } from 'vitest'
import { requirePermissao, bloqueiaEscritaDeConsulta } from './auth'
import type { AuthRequest } from './auth'
import type { Response } from 'express'

function mockReq(user: AuthRequest['user']): AuthRequest {
  return { user } as AuthRequest
}

describe('requirePermissao (RBAC dinâmico)', () => {
  it('libera MASTER mesmo sem a permissão explícita', () => {
    const req = mockReq({ id: '1', role: 'MASTER', name: 'Admin', email: 'a@a.com', permissoes: [] })
    const next = vi.fn()
    requirePermissao('equipes.gerenciar')(req, {} as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('libera PADRAO com a permissão concedida pelo perfil', () => {
    const req = mockReq({ id: '2', role: 'PADRAO', name: 'User', email: 'u@u.com', permissoes: ['equipes.gerenciar'] })
    const next = vi.fn()
    requirePermissao('equipes.gerenciar')(req, {} as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('bloqueia PADRAO sem a permissão exigida', () => {
    const req = mockReq({ id: '3', role: 'PADRAO', name: 'User', email: 'u@u.com', permissoes: ['tipos_demanda.gerenciar'] })
    const next = vi.fn()
    expect(() => requirePermissao('equipes.gerenciar')(req, {} as Response, next)).toThrow(/equipes\.gerenciar/)
    expect(next).not.toHaveBeenCalled()
  })

  it('bloqueia PADRAO sem nenhum perfil atribuído', () => {
    const req = mockReq({ id: '4', role: 'PADRAO', name: 'User', email: 'u@u.com', permissoes: [] })
    const next = vi.fn()
    expect(() => requirePermissao('equipes.gerenciar')(req, {} as Response, next)).toThrow()
    expect(next).not.toHaveBeenCalled()
  })

  it('uma permissão não vaza para outra chave', () => {
    const req = mockReq({ id: '5', role: 'PADRAO', name: 'User', email: 'u@u.com', permissoes: ['equipes.gerenciar'] })
    const next = vi.fn()
    expect(() => requirePermissao('tipos_demanda.gerenciar')(req, {} as Response, next)).toThrow()
    expect(next).not.toHaveBeenCalled()
  })
})

describe('bloqueiaEscritaDeConsulta (perfil só-leitura global)', () => {
  it('libera GET em qualquer rota pra CONSULTA', () => {
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'GET', '/api/demandas')).toBe(false)
  })

  it('bloqueia POST/PUT/DELETE em rotas de negócio pra CONSULTA', () => {
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'POST', '/api/demandas')).toBe(true)
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'PUT', '/api/imoveis/123')).toBe(true)
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'DELETE', '/api/ocorrencias/123')).toBe(true)
  })

  it('libera as próprias rotas de conta (/api/auth) mesmo em escrita', () => {
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'PUT', '/api/auth/change-password')).toBe(false)
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'POST', '/api/auth/logout')).toBe(false)
  })

  it('libera notificações pessoais mesmo em escrita', () => {
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'PUT', '/api/notificacoes/123/lida')).toBe(false)
  })

  it('libera o Resumo da demanda (resumo-consulta e resumo-formal) mesmo sendo POST', () => {
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'POST', '/api/demandas/abc123/resumo-consulta')).toBe(false)
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'POST', '/api/demandas/abc123/resumo-formal')).toBe(false)
  })

  it('continua bloqueando outras escritas dentro de /api/demandas', () => {
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'POST', '/api/demandas')).toBe(true)
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'PUT', '/api/demandas/abc123')).toBe(true)
    expect(bloqueiaEscritaDeConsulta('CONSULTA', 'DELETE', '/api/demandas/abc123')).toBe(true)
  })

  it('nunca bloqueia MASTER ou PADRAO, mesmo em escrita', () => {
    expect(bloqueiaEscritaDeConsulta('MASTER', 'DELETE', '/api/demandas/1')).toBe(false)
    expect(bloqueiaEscritaDeConsulta('PADRAO', 'POST', '/api/ocorrencias')).toBe(false)
  })
})
