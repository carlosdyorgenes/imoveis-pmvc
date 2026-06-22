'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Imovel } from '@/types'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const cdn = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images'
const shadowUrl = `${cdn}/marker-shadow.png`
const iconBase = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img'

// Ícone azul explícito (exatos) — evita o caminho bugado do ícone padrão na remoção
const exatoIcon = new L.Icon({
  iconUrl: `${cdn}/marker-icon.png`,
  iconRetinaUrl: `${cdn}/marker-icon-2x.png`,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Marcador laranja para localizações estimadas pelo endereço
const estimadoIcon = new L.Icon({
  iconUrl: `${iconBase}/marker-icon-orange.png`,
  iconRetinaUrl: `${iconBase}/marker-icon-2x-orange.png`,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const coordValida = (im: Imovel | null): im is Imovel & { latitude: number; longitude: number } =>
  !!im && Number.isFinite(im.latitude) && Number.isFinite(im.longitude)

function FlyTo({ imovel }: { imovel: Imovel | null }) {
  const map = useMap()
  useEffect(() => {
    if (coordValida(imovel)) {
      map.flyTo([imovel.latitude, imovel.longitude], 17, { duration: 1 })
    }
  }, [imovel, map])
  return null
}

interface Props {
  imoveis: Imovel[]
  selected: Imovel | null
  onSelect: (im: Imovel) => void
}

export default function MapView({ imoveis, selected, onSelect }: Props) {
  const center: [number, number] = coordValida(selected)
    ? [selected.latitude, selected.longitude]
    : [-14.8529, -40.8440]

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyTo imovel={selected} />
      {imoveis.filter(coordValida).map(im => (
        <Marker
          key={im.id}
          position={[im.latitude!, im.longitude!]}
          icon={im.estimado ? estimadoIcon : exatoIcon}
          eventHandlers={{ click: () => onSelect(im) }}
        >
          <Popup>
            <div className="min-w-48">
              <p className="font-bold text-primary-700 font-mono text-xs">{im.inscricaoImobiliaria}</p>
              <p className="text-xs mt-1">{im.logradouro}, {im.numero || 'S/N'}</p>
              <p className="text-xs text-gray-500">{im.bairro} · {im.secretaria}</p>
              {im.estimado && (
                <p className="text-xs text-amber-600 mt-1">
                  ≈ Estimada pelo endereço
                  {im.precisaoGeo === 'rua' ? ' (nível de rua)' : im.precisaoGeo === 'area' ? ' (nível de bairro)' : ''}
                </p>
              )}
              <div className="flex gap-1 mt-1.5">
                <span className={im.tipo === 'PROPRIO' ? 'badge-proprio' : 'badge-locado'}>{im.tipo}</span>
                <span className={im.zona === 'URBANO' ? 'badge-urbano' : 'badge-rural'}>{im.zona}</span>
              </div>
              <a
                href={`https://maps.google.com/?q=${im.latitude},${im.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-600 hover:underline mt-2 block"
              >
                Ver no Google Maps →
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
