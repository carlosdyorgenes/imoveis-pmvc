'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Imovel } from '@/types'
import { Search, MapPin, ExternalLink } from 'lucide-react'
import dynamic from 'next/dynamic'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

export default function MapaPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Imovel | null>(null)
  const [showAll, setShowAll] = useState(false)

  const { data: imoveis = [] } = useQuery<Imovel[]>({
    queryKey: ['imoveis'],
    queryFn: () => api.get('/api/imoveis').then(r => r.data)
  })

  const comCoordenadas = imoveis.filter(i => i.latitude && i.longitude)

  const filtrados = comCoordenadas.filter(im =>
    im.inscricaoImobiliaria.toLowerCase().includes(search.toLowerCase()) ||
    im.logradouro.toLowerCase().includes(search.toLowerCase())
  )

  const exibidos = showAll ? comCoordenadas : selected ? [selected] : []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Localização Espacial</h1>
        <p className="text-gray-500 mt-0.5">{comCoordenadas.length} imóvel(is) geo-referenciado(s)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="card">
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  className="input pl-9 text-sm"
                  placeholder="Buscar por inscrição..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={() => { setShowAll(true); setSelected(null) }}
              className="btn-secondary w-full justify-center text-sm mb-3"
            >
              <MapPin className="w-4 h-4" /> Listar Todos no Mapa
            </button>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(search ? filtrados : comCoordenadas).slice(0, 50).map(im => (
                <button
                  key={im.id}
                  onClick={() => { setSelected(im); setShowAll(false) }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected?.id === im.id
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-mono text-xs font-semibold text-primary-700">{im.inscricaoImobiliaria}</p>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">{im.logradouro}, {im.bairro}</p>
                  <p className="text-xs text-gray-400 mt-0.5">📍 {im.latitude?.toFixed(4)}, {im.longitude?.toFixed(4)}</p>
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <div className="card">
              <h3 className="font-semibold text-sm mb-2">Imóvel Selecionado</h3>
              <p className="font-mono text-xs text-primary-700 font-bold">{selected.inscricaoImobiliaria}</p>
              <p className="text-xs text-gray-600 mt-1">{selected.logradouro}, {selected.numero || 'S/N'}</p>
              <p className="text-xs text-gray-500">{selected.bairro} - {selected.secretaria}</p>
              <div className="flex gap-2 mt-3">
                <a
                  href={`https://maps.google.com/?q=${selected.latitude},${selected.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-xs flex-1 justify-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir no Google Maps
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="card p-0 overflow-hidden" style={{ height: '600px' }}>
            <MapView imoveis={exibidos} selected={selected} onSelect={setSelected} />
          </div>
        </div>
      </div>
    </div>
  )
}
