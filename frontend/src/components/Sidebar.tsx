'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import {
  Building2, LayoutDashboard, MapPin, ClipboardList,
  KanbanSquare, BarChart3, Users, ScrollText, LogOut, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'

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

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, isMaster } = useAuth()
  const [open, setOpen] = useState(false)

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
        <div className="p-6 border-b border-primary-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">PMVC</p>
              <p className="text-primary-300 text-xs">Controle de Imóveis</p>
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
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-xs font-bold">
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
    </>
  )
}
