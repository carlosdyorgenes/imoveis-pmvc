import { Imovel } from '@/types'

export interface GeoResult { lat: number; lon: number }

const CACHE_KEY = 'geocode_cache_v2'

function loadCache(): Record<string, GeoResult | null> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}

function saveCache(c: Record<string, GeoResult | null>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* ignore */ }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Retorna uma string de endereço para geocodificar, ou null se incompleto.
// Consideramos "completo o suficiente" quando há logradouro + bairro + cidade.
// É usada como chave de cache e como fallback de busca por texto livre.
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

async function nominatim(params: Record<string, string>): Promise<GeoResult | null> {
  try {
    const qs = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'br', ...params })
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs.toString()}`, {
      headers: { 'Accept-Language': 'pt-BR' },
    })
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat)
      const lon = parseFloat(data[0].lon)
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon }
    }
  } catch { /* ignore */ }
  return null
}

// Geocodifica um imóvel priorizando a precisão do número:
// 1) busca estruturada com "número logradouro" (Nominatim respeita o house number)
// 2) se falhar, busca estruturada só pelo logradouro
// 3) se falhar, busca por texto livre (rua/bairro/cidade)
async function geocodeImovel(im: Imovel): Promise<GeoResult | null> {
  const base = {
    city: im.cidade,
    state: im.estado,
    ...(im.cep ? { postalcode: im.cep } : {}),
  }

  if (im.numero?.trim()) {
    const comNumero = await nominatim({ ...base, street: `${im.numero} ${im.logradouro}` })
    if (comNumero) return comNumero
    await sleep(1100)
  }

  const semNumero = await nominatim({ ...base, street: im.logradouro })
  if (semNumero) return semNumero

  const query = buildEndereco(im)
  if (query) {
    await sleep(1100)
    return nominatim({ q: query })
  }
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
    const result = await geocodeImovel(im)
    consultou = true
    cache[query] = result
    if (result) out[im.id] = result
  }

  saveCache(cache)
  return out
}
