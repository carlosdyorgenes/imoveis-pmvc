'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Building2, LayoutDashboard, MapPin, ClipboardList,
  KanbanSquare, BarChart3, Users, ScrollText, LogOut, Menu, X, Bell
} from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/imoveis', label: 'Imóveis', icon: Building2 },
  { href: '/ocorrencias', label: 'Ocorrências', icon: ClipboardList },
  { href: '/tarefas', label: 'Tarefas', icon: KanbanSquare },
  { href: '/mapa', label: 'Mapa', icon: MapPin },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/usuarios', label: 'Usuários', icon: Users, masterOnly: true },
  { href: '/logs', label: 'Logs', icon: ScrollText, masterOnly: true },
]

interface PasswordRequest {
  id: string
  userId: string
  status: string
  createdAt: string
  user: { id: string; name: string; email: string }
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, isMaster } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showRequests, setShowRequests] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [novaSenha, setNovaSenha] = useState('')

  const { data: requestCount } = useQuery({
    queryKey: ['password-requests-count'],
    queryFn: () => api.get('/api/auth/password-requests/count').then(r => r.data.count as number),
    enabled: !!isMaster,
    refetchInterval: 30_000,
  })

  const { data: requests = [] } = useQuery<PasswordRequest[]>({
    queryKey: ['password-requests'],
    queryFn: () => api.get('/api/auth/password-requests').then(r => r.data),
    enabled: !!isMaster && showRequests,
  })

  const resolveMutation = useMutation({
    mutationFn: ({ id, senha }: { id: string; senha: string }) =>
      api.put(`/api/auth/password-requests/${id}/resolve`, { novaSenha: senha }),
    onSuccess: (res) => {
      toast.success(res.data.message)
      setResolvingId(null)
      setNovaSenha('')
      qc.invalidateQueries({ queryKey: ['password-requests'] })
      qc.invalidateQueries({ queryKey: ['password-requests-count'] })
    },
    onError: () => toast.error('Erro ao redefinir senha')
  })

  const handleLogout = async () => {
    try { await api.post('/api/auth/logout') } catch {}
    logout()
    router.push('/login')
  }

  const items = navItems.filter(i => !i.masterOnly || isMaster)

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setOpen(false)} />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-primary-900 text-white z-40 flex flex-col
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo e título */}
        <div className="p-5 border-b border-primary-700">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <Image
                src="/brasao.png"
                alt="Brasão PMVC"
                width={44}
                height={44}
                className="drop-shadow"
              />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight">PMVC</p>
              <p className="text-primary-300 text-xs leading-tight">Controle de Imóveis</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-primary-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-primary-700">
          {/* Botão de notificações de senha (master) */}
          {isMaster && (
            <button
              onClick={() => setShowRequests(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 mb-2 rounded-lg text-sm text-primary-200 hover:bg-white/10 hover:text-white transition-colors"
            >
              <div className="relative">
                <Bell className="w-4 h-4" />
                {!!requestCount && requestCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {requestCount}
                  </span>
                )}
              </div>
              <span>Redefinições de Senha</span>
              {!!requestCount && requestCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{requestCount}</span>
              )}
            </button>
          )}

          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-primary-300">{user?.role === 'MASTER' ? 'Administrador' : 'Padrão'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-primary-300 hover:text-white text-sm w-full px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Modal de solicitações de redefinição de senha */}
      {showRequests && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-800">Solicitações de Redefinição de Senha</h2>
                <p className="text-xs text-gray-500 mt-0.5">{requests.length} solicitação(ões) pendente(s)</p>
              </div>
              <button onClick={() => { setShowRequests(false); setResolvingId(null); setNovaSenha('') }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5">
              {requests.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma solicitação pendente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map(req => (
                    <div key={req.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{req.user.name}</p>
                          <p className="text-xs text-gray-500">{req.user.email}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Solicitado em {new Date(req.createdAt).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        {resolvingId !== req.id && (
                          <button
                            onClick={() => { setResolvingId(req.id); setNovaSenha('') }}
                            className="btn-primary text-xs"
                          >
                            Redefinir
                          </button>
                        )}
                      </div>

                      {resolvingId === req.id && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <label className="label">Nova Senha</label>
                          <input
                            type="text"
                            className="input mb-2"
                            placeholder="Mínimo 6 caracteres"
                            value={novaSenha}
                            onChange={e => setNovaSenha(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setResolvingId(null)} className="btn-secondary text-xs flex-1 justify-center">Cancelar</button>
                            <button
                              onClick={() => novaSenha.length >= 6 && resolveMutation.mutate({ id: req.id, senha: novaSenha })}
                              disabled={novaSenha.length < 6 || resolveMutation.isPending}
                              className="btn-primary text-xs flex-1 justify-center"
                            >
                              {resolveMutation.isPending ? 'Salvando...' : 'Confirmar'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
