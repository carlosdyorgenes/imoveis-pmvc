import { Imovel } from '@/types'

export interface GeoResult { lat: number; lon: number }

const CACHE_KEY = 'geocode_cache_v1'

function loadCache(): Record<string, GeoResult | null> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}

function saveCache(c: Record<string, GeoResult | null>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* ignore */ }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Retorna uma string de endereço para geocodificar, ou null se incompleto.
// Consideramos "completo o suficiente" quando há logradouro + bairro + cidade.
export function buildEndereco(im: Imovel): string | null {
  if (!im.logradouro?.trim() || !im.bairro?.trim() || !im.cidade?.trim()) return null
  const partes = [
    im.numero ? `${im.logradouro}, ${im.numero}` : im.logradouro,
    im.bairro,
    im.cidade,
    im.estado,
    im.cep,
    'Brasil',
  ].filter(Boolean)
  return partes.join(', ')
}

async function geocodeEndereco(query: string): Promise<GeoResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
    }
  } catch { /* ignore */ }
  return null
}

// Geocodifica uma lista de imóveis sem coordenadas, usando cache por endereço
// e respeitando o limite de ~1 requisição/segundo do Nominatim.
// Retorna um mapa de imovelId -> coordenadas estimadas.
export async function geocodeImoveis(imoveis: Imovel[]): Promise<Record<string, GeoResult>> {
  const cache = loadCache()
  const out: Record<string, GeoResult> = {}
  let consultou = false

  for (const im of imoveis) {
    const query = buildEndereco(im)
    if (!query) continue

    if (query in cache) {
      const cached = cache[query]
      if (cached) out[im.id] = cached
      continue
    }

    if (consultou) await sleep(1100) // respeita o rate limit entre chamadas reais
    const result = await geocodeEndereco(query)
    consultou = true
    cache[query] = result
    if (result) out[im.id] = result
  }

  saveCache(cache)
  return out
}
