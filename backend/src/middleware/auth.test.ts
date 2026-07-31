import { describe, it, expect, vi } from 'vitest'
import { requirePermissao } from './auth'
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
