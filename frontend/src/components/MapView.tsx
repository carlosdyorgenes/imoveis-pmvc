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

function FlyTo({ imovel }: { imovel: Imovel | null }) {
  const map = useMap()
  useEffect(() => {
    if (imovel?.latitude && imovel?.longitude) {
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
  const center: [number, number] = selected?.latitude
    ? [selected.latitude, selected.longitude!]
    : [-14.8529, -40.8440]

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyTo imovel={selected} />
      {imoveis.map(im => (
        <Marker
          key={im.id}
          position={[im.latitude!, im.longitude!]}
          eventHandlers={{ click: () => onSelect(im) }}
        >
          <Popup>
            <div className="min-w-48">
              <p className="font-bold text-primary-700 font-mono text-xs">{im.inscricaoImobiliaria}</p>
              <p className="text-xs mt-1">{im.logradouro}, {im.numero || 'S/N'}</p>
              <p className="text-xs text-gray-500">{im.bairro} · {im.secretaria}</p>
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
