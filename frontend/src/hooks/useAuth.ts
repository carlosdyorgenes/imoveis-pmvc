'use client'
import { useState, useEffect } from 'react'
import { User } from '@/types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (stored) setUser(JSON.parse(stored))
    setLoading(false)
  }, [])

  const login = (token: string, userData: User) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  // Perfil só-leitura: pode ver todas as áreas, mas o backend rejeita qualquer inclusão,
  // alteração ou exclusão pra esse perfil (ver bloqueiaEscritaDeConsulta no middleware
  // authenticate) — isConsulta serve só pra esconder os controles de escrita na UI.
  return { user, loading, login, logout, isMaster: user?.role === 'MASTER', isConsulta: user?.role === 'CONSULTA' }
}
