import fs from 'fs'

// Cliente mínimo da API do Google Drive (sem a biblioteca oficial, que é pesada para o
// servidor). Usa OAuth com refresh token e o escopo "drive.file": o app só enxerga os
// arquivos e pastas que ele mesmo criou, nunca o resto do Drive.
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

export interface ArquivoDrive { id: string; name: string; createdTime: string }

export function driveConfigurado(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN)
}

let cache: { token: string; expira: number } | null = null

async function accessToken(): Promise<string> {
  if (cache && cache.expira > Date.now() + 60_000) return cache.token
  const resposta = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  })
  if (!resposta.ok) throw new Error(`Falha ao autenticar no Google (${resposta.status}): ${await resposta.text()}`)
  const dados = await resposta.json() as { access_token: string; expires_in: number }
  cache = { token: dados.access_token, expira: Date.now() + dados.expires_in * 1000 }
  return cache.token
}

async function chamar(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken()
  const resposta = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } })
  if (!resposta.ok) throw new Error(`Google Drive retornou ${resposta.status}: ${await resposta.text()}`)
  return resposta
}

const escapar = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export async function garantirPasta(nome: string, paiId?: string): Promise<string> {
  // Sem pasta-pai, procura em todo o Drive (com drive.file só aparecem pastas criadas pelo
  // próprio app) — assim a pasta raiz continua sendo encontrada se você movê-la no Drive.
  const q = [`name='${escapar(nome)}'`, "mimeType='application/vnd.google-apps.folder'", 'trashed=false', ...(paiId ? [`'${paiId}' in parents`] : [])].join(' and ')
  const lista = await (await chamar(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json() as { files: { id: string }[] }
  if (lista.files[0]) return lista.files[0].id
  const criada = await (await chamar(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', ...(paiId ? { parents: [paiId] } : {}) }),
  })).json() as { id: string }
  return criada.id
}

export async function listarArquivos(pastaId: string): Promise<ArquivoDrive[]> {
  const todos: ArquivoDrive[] = []
  let pagina: string | undefined
  do {
    const q = `'${pastaId}' in parents and trashed=false`
    const url = `${API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,createdTime)&pageSize=1000${pagina ? `&pageToken=${pagina}` : ''}`
    const dados = await (await chamar(url)).json() as { files: ArquivoDrive[]; nextPageToken?: string }
    todos.push(...dados.files)
    pagina = dados.nextPageToken
  } while (pagina)
  return todos
}

// Upload "resumable" com o corpo em stream — não carrega o arquivo inteiro na memória.
export async function enviarArquivo(caminho: string, nome: string, pastaId: string): Promise<string> {
  const tamanho = fs.statSync(caminho).size
  const sessao = await chamar(`${UPLOAD}?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(tamanho) },
    body: JSON.stringify({ name: nome, parents: [pastaId] }),
  })
  const destino = sessao.headers.get('location')
  if (!destino) throw new Error('Google Drive não devolveu o endereço de upload')
  const envio = await chamar(destino, {
    method: 'PUT',
    headers: { 'content-length': String(tamanho), 'content-type': 'application/octet-stream' },
    body: fs.createReadStream(caminho) as unknown as RequestInit["body"],
    duplex: 'half',
  } as RequestInit)
  return (await envio.json() as { id: string }).id
}

export async function apagarArquivo(id: string): Promise<void> {
  await chamar(`${API}/files/${id}`, { method: 'DELETE' })
}
