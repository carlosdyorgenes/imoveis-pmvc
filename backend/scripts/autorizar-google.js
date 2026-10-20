'use strict'

/**
 * Autorização única do Google Drive para o BACKUP DO SISTEMA DE IMÓVEIS — rodar no SEU computador:
 *
 *   set GOOGLE_CLIENT_ID=...        (cliente OAuth "Backup Sistema Imoveis PMVC")
 *   set GOOGLE_CLIENT_SECRET=...
 *   node backend\scripts\autorizar-google.js
 *
 * Abre o navegador para você autorizar e mostra, no terminal, o comando para guardar os
 * valores como segredos do app imoveis-pmvc-api no Fly (sem reiniciar a máquina: --stage).
 */

const http = require('http')
const readline = require('readline')
const { exec } = require('child_process')

const APP_FLY = 'imoveis-pmvc-api'
const PORTA = 53682
const REDIRECT = `http://127.0.0.1:${PORTA}`
const ESCOPO = 'https://www.googleapis.com/auth/drive.file'

async function main() {
  let clientId = (process.env.GOOGLE_CLIENT_ID || '').trim()
  let clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()

  if (!clientId || !clientSecret) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const perguntar = (msg) => new Promise((resolve) => rl.question(msg, (r) => resolve(r.trim())))
    if (!clientId) clientId = await perguntar('ID do cliente (Client ID): ')
    if (!clientSecret) clientSecret = await perguntar('Segredo do cliente (Client secret): ')
    rl.close()
  }

  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    throw new Error('O ID do cliente parece vazio ou incorreto (deve terminar em ".apps.googleusercontent.com").')
  }
  if (!clientSecret) throw new Error('O segredo do cliente está vazio.')

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId, redirect_uri: REDIRECT, response_type: 'code',
    scope: ESCOPO, access_type: 'offline', prompt: 'consent',
  })

  const codigo = await new Promise((resolve, reject) => {
    const servidor = http.createServer((req, res) => {
      const u = new URL(req.url, REDIRECT)
      const code = u.searchParams.get('code')
      const erro = u.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(code ? '<h2>Autorizado! Pode fechar esta janela e voltar ao terminal.</h2>' : '<h2>Autorização negada ou cancelada.</h2>')
      servidor.close()
      code ? resolve(code) : reject(new Error('Autorização não concedida: ' + (erro || 'sem código')))
    })
    servidor.listen(PORTA, '127.0.0.1', () => {
      console.log('\nAbrindo o navegador. Se não abrir, acesse este endereço:\n\n' + url + '\n')
      exec(`start "" "${url}"`)
    })
  })

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: codigo, client_id: clientId, client_secret: clientSecret,
      redirect_uri: REDIRECT, grant_type: 'authorization_code',
    }),
  })
  const dados = await resp.json()
  if (!dados.refresh_token) {
    throw new Error('O Google não devolveu o refresh token: ' + (dados.error_description || dados.error || 'tente novamente'))
  }

  console.log(`\nPronto! Rode este comando para guardar os valores no app ${APP_FLY} (não compartilhe nem salve em arquivo):\n`)
  console.log(`fly secrets set --stage -a ${APP_FLY} GOOGLE_CLIENT_ID="${clientId}" GOOGLE_CLIENT_SECRET="${clientSecret}" GOOGLE_REFRESH_TOKEN="${dados.refresh_token}"\n`)
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1) })
