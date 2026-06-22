'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const cdn = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images'
const pickerIcon = new L.Icon({
  iconUrl: `${cdn}/marker-icon.png`,
  iconRetinaUrl: `${cdn}/marker-icon-2x.png`,
  shadowUrl: `${cdn}/marker-shadow.png`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const VC_CENTER: [number, number] = [-14.8529, -40.8440]

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

// Recentraliza o mapa quando um alvo externo muda (ex.: "centralizar no endereço")
function FlyToTarget({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target && Number.isFinite(target[0]) && Number.isFinite(target[1])) {
      map.flyTo(target, 17, { duration: 1 })
    }
  }, [target, map])
  return null
}

interface Props {
  lat?: number
  lng?: number
  flyTo: [number, number] | null
  onChange: (lat: number, lng: number) => void
}

export default function LocationPicker({ lat, lng, flyTo, onChange }: Props) {
  const has = Number.isFinite(lat) && Number.isFinite(lng)
  const center: [number, number] = has ? [lat as number, lng as number] : VC_CENTER

  return (
    <MapContainer center={center} zoom={has ? 16 : 13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onChange} />
      <FlyToTarget target={flyTo} />
      {has && (
        <Marker
          position={[lat as number, lng as number]}
          icon={pickerIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng()
              onChange(p.lat, p.lng)
            },
          }}
        />
      )}
    </MapContainer>
  )
}
