'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isConsulta } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-64 min-h-screen bg-gray-50">
        {isConsulta && (
          <div className="bg-sky-600 text-white text-xs font-medium text-center py-1.5 px-4">
            Modo consulta — você pode visualizar todas as áreas, mas não pode incluir, alterar ou excluir nada.
          </div>
        )}
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
