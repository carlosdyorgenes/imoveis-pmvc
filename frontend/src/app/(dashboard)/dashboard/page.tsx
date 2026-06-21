'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Building2, ClipboardList, KanbanSquare, MapPin, TrendingUp, Home } from 'lucide-react'
import Link from 'next/link'
import { Imovel, Ocorrencia } from '@/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function DashboardPage() {
  const { data: imoveis = [] } = useQuery<Imovel[]>({ queryKey: ['imoveis'], queryFn: () => api.get('/api/imoveis').then(r => r.data) })
  const { data: ocorrencias = [] } = useQuery<Ocorrencia[]>({ queryKey: ['ocorrencias'], queryFn: () => api.get('/api/ocorrencias').then(r => r.data) })

  const proprios = imoveis.filter(i => i.tipo === 'PROPRIO').length
  const locados = imoveis.filter(i => i.tipo === 'LOCADO').length
  const urbanos = imoveis.filter(i => i.zona === 'URBANO').length
  const rurais = imoveis.filter(i => i.zona === 'RURAL').length
  const comCoordenadas = imoveis.filter(i => i.latitude && i.longitude).length

  const cards = [
    { label: 'Total de Imóveis', value: imoveis.length, icon: Building2, color: 'bg-blue-500', href: '/imoveis' },
    { label: 'Imóveis Próprios', value: proprios, icon: Home, color: 'bg-emerald-500', href: '/imoveis?tipo=PROPRIO' },
    { label: 'Imóveis Locados', value: locados, icon: Building2, color: 'bg-amber-500', href: '/imoveis?tipo=LOCADO' },
    { label: 'Ocorrências', value: ocorrencias.length, icon: ClipboardList, color: 'bg-purple-500', href: '/ocorrencias' },
    { label: 'Zona Urbana', value: urbanos, icon: TrendingUp, color: 'bg-indigo-500', href: '/imoveis?zona=URBANO' },
    { label: 'Zona Rural', value: rurais, icon: MapPin, color: 'bg-lime-500', href: '/imoveis?zona=RURAL' },
    { label: 'Geo-referenciados', value: comCoordenadas, icon: MapPin, color: 'bg-rose-500', href: '/mapa' },
    { label: 'Sem Coordenadas', value: imoveis.length - comCoordenadas, icon: MapPin, color: 'bg-gray-400', href: '/imoveis' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Visão geral do controle de imóveis públicos</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href} className="card hover:shadow-md transition-shadow group">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-purple-500" />
            Últimas Ocorrências
          </h2>
          <div className="space-y-3">
            {ocorrencias.slice(0, 5).map(oc => (
              <div key={oc.id} className="flex gap-3 text-sm">
                <div className="flex-shrink-0 w-1 bg-purple-200 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-700 truncate">{oc.descricao}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {oc.user?.name} · {format(new Date(oc.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            ))}
            {ocorrencias.length === 0 && <p className="text-gray-400 text-sm">Nenhuma ocorrência registrada</p>}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            Últimos Imóveis Cadastrados
          </h2>
          <div className="space-y-3">
            {imoveis.slice(0, 5).map(im => (
              <Link key={im.id} href={`/imoveis/${im.id}`} className="flex gap-3 text-sm hover:bg-gray-50 -mx-2 px-2 py-1 rounded-lg transition-colors">
                <div className="flex-shrink-0 w-1 bg-blue-200 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-700 truncate">{im.inscricaoImobiliaria}</p>
                  <p className="text-gray-400 text-xs mt-0.5 truncate">{im.logradouro}, {im.bairro} · {im.secretaria}</p>
                </div>
                <div className={im.tipo === 'PROPRIO' ? 'badge-proprio' : 'badge-locado'}>{im.tipo}</div>
              </Link>
            ))}
            {imoveis.length === 0 && <p className="text-gray-400 text-sm">Nenhum imóvel cadastrado</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
