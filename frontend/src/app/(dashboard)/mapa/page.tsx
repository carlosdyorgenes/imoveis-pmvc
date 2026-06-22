'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Imovel } from '@/types'
import { Search, MapPin, ExternalLink, Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { buildEndereco, geocodeImoveis } from '@/lib/geocode'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

export default function MapaPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Imovel | null>(null)
  const [showAll, setShowAll] = useState(false)

  const { data: imoveis = [] } = useQuery<Imovel[]>({
    queryKey: ['imoveis'],
    queryFn: () => api.get('/api/imoveis').then(r => r.data)
  })

  // Imóveis sem coordenadas mas com endereço completo o suficiente para estimar
  const semCoordsComEndereco = imoveis.filter(
    i => (!i.latitude || !i.longitude) && buildEndereco(i) !== null
  )

  // Geocodifica esses imóveis (cacheado em localStorage, throttled)
  const { data: geocoded = {}, isFetching: geocoding } = useQuery({
    queryKey: ['geocode', semCoordsComEndereco.map(i => `${i.id}:${buildEndereco(i)}`).join('|')],
    queryFn: () => geocodeImoveis(semCoordsComEndereco),
    enabled: semCoordsComEndereco.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  // Lista final com localização: coordenadas exatas têm prioridade; senão, estimadas pelo endereço
  const imoveisComLocal: Imovel[] = imoveis.flatMap<Imovel>(im => {
    if (im.latitude && im.longitude) return [{ ...im, estimado: false }]
    const g = geocoded[im.id]
    if (g) return [{ ...im, latitude: g.lat, longitude: g.lon, estimado: true, precisaoGeo: g.precisao }]
    return []
  })

  const exatos = imoveisComLocal.filter(i => !i.estimado)
  const estimados = imoveisComLocal.filter(i => i.estimado)
  const semLocalizacao = imoveis.length - imoveisComLocal.length

  const filtrados = imoveisComLocal.filter(im =>
    im.inscricaoImobiliaria.toLowerCase().includes(search.toLowerCase()) ||
    im.logradouro.toLowerCase().includes(search.toLowerCase())
  )

  const exibidos = showAll ? imoveisComLocal : selected ? [selected] : []

  const precisaoLabel: Record<string, string> = {
    casa: 'nível de número (exato)',
    rua: 'nível de rua (aproximada)',
    area: 'nível de bairro (aproximada)',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Localização Espacial</h1>
        <p className="text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{imoveisComLocal.length} imóvel(is) no mapa</span>
          <span className="text-gray-300">·</span>
          <span className="text-blue-600">{exatos.length} por coordenadas</span>
          <span className="text-gray-300">·</span>
          <span className="text-amber-600">{estimados.length} estimado(s) por endereço</span>
          {semLocalizacao > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400">{semLocalizacao} sem localização</span>
            </>
          )}
          {geocoding && (
            <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
              <Loader2 className="w-3 h-3 animate-spin" /> estimando endereços...
            </span>
          )}
        </p>
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
              {(search ? filtrados : imoveisComLocal).slice(0, 50).map(im => (
                <button
                  key={im.id}
                  onClick={() => { setSelected(im); setShowAll(false) }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected?.id === im.id
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-semibold text-primary-700">{im.inscricaoImobiliaria}</p>
                    {im.estimado && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">estimado</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">{im.logradouro}, {im.bairro}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {im.estimado ? '≈' : '📍'} {im.latitude?.toFixed(4)}, {im.longitude?.toFixed(4)}
                  </p>
                  {im.estimado && im.precisaoGeo && (
                    <p className="text-[10px] text-amber-600 mt-0.5">{precisaoLabel[im.precisaoGeo]}</p>
                  )}
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
              {selected.estimado && (
                <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded-lg p-2">
                  ⚠ Localização estimada a partir do endereço (sem coordenadas cadastradas)
                  {selected.precisaoGeo ? ` — ${precisaoLabel[selected.precisaoGeo]}` : ''}.
                  {selected.precisaoGeo !== 'casa' && ' Para precisão exata, cadastre as coordenadas do imóvel.'}
                </p>
              )}
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
