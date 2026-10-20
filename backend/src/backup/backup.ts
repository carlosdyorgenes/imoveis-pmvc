import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import { prisma } from '../lib/prisma'
import { driveConfigurado, garantirPasta, listarArquivos, enviarArquivo, apagarArquivo } from './drive'

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'documentos')
const PASTA_RAIZ = process.env.BACKUP_PASTA_RAIZ?.trim() || 'Backup Imoveis PMVC'
const DUMPS_MANTIDOS = 30
const NOME_DUMP = /^imoveis_(\d{4}-\d{2}-\d{2})\.dump$/

let emExecucao = false

export function backupEmExecucao() { return emExecucao }

function dataBrasilia(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function gerarDump(destino: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const bruta = process.env.DATABASE_URL
    if (!bruta) return reject(new Error('DATABASE_URL não configurada'))
    const url = new URL(bruta)
    url.searchParams.delete('schema')
    const proc = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', destino, '--dbname', url.toString()])
    let erro = ''
    proc.stderr.on('data', d => { erro += d.toString() })
    proc.on('error', e => reject(new Error(`pg_dump indisponível: ${e.message}`)))
    proc.on('close', codigo => codigo === 0 ? resolve() : reject(new Error(`pg_dump falhou (${codigo}): ${erro.slice(0, 500)}`)))
  })
}

async function avisarMasters(mensagem: string) {
  try {
    const masters = await prisma.user.findMany({ where: { role: 'MASTER', active: true }, select: { id: true } })
    if (masters.length === 0) return
    await prisma.notificacao.createMany({ data: masters.map(m => ({ userId: m.id, tipo: 'BACKUP_FALHA', mensagem })) })
  } catch (e) {
    console.error('[backup] não foi possível notificar os masters', e)
  }
}

// Banco: dump (pg_dump, formato compactado) do dia, os últimos 30 ficam. Anexos: só o que
// ainda não está no Drive (os nomes dos arquivos são UUIDs imutáveis, então o nome basta).
async function rodarBackup(): Promise<Record<string, unknown>> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'))
  try {
    const raiz = await garantirPasta(PASTA_RAIZ)
    const pastaBanco = await garantirPasta('banco', raiz)
    const pastaAnexos = await garantirPasta('anexos', raiz)

    const hoje = dataBrasilia()
    const nomeDump = `imoveis_${hoje}.dump`
    const dumpArquivo = path.join(tmp, nomeDump)
    await gerarDump(dumpArquivo)
    const tamanhoDump = fs.statSync(dumpArquivo).size

    const existentes = await listarArquivos(pastaBanco)
    const novoId = await enviarArquivo(dumpArquivo, nomeDump, pastaBanco)
    fs.rmSync(dumpArquivo)
    // Só depois do upload novo concluído: remove o dump anterior do mesmo dia e os mais antigos.
    for (const a of existentes.filter(e => e.name === nomeDump && e.id !== novoId)) await apagarArquivo(a.id)
    const datados = existentes.filter(e => NOME_DUMP.test(e.name) && e.name !== nomeDump).sort((a, b) => b.name.localeCompare(a.name))
    for (const velho of datados.slice(DUMPS_MANTIDOS - 1)) await apagarArquivo(velho.id)

    const jaNoDrive = new Set((await listarArquivos(pastaAnexos)).map(a => a.name))
    const noDisco = fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : []
    let novos = 0
    const falhas: string[] = []
    for (const arquivo of noDisco) {
      if (jaNoDrive.has(arquivo)) continue
      try {
        await enviarArquivo(path.join(UPLOADS_DIR, arquivo), arquivo, pastaAnexos)
        novos++
      } catch (e) {
        falhas.push(`${arquivo}: ${e instanceof Error ? e.message : 'erro'}`)
      }
    }
    if (falhas.length > 0) throw new Error(`${falhas.length} anexo(s) não enviados: ${falhas.slice(0, 3).join(' | ')}`)

    return { dump: nomeDump, tamanhoDumpBytes: tamanhoDump, anexosNovos: novos, anexosNoDisco: noDisco.length }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

export async function executarBackup(origem: 'AGENDADO' | 'MANUAL'): Promise<{ ok: boolean; mensagem: string }> {
  if (emExecucao) return { ok: false, mensagem: 'Já existe um backup em execução' }
  if (!driveConfigurado()) return { ok: false, mensagem: 'Google Drive não configurado neste servidor' }
  emExecucao = true
  const registro = await prisma.backupExecucao.create({ data: { origem } })
  try {
    const detalhes = await rodarBackup()
    await prisma.backupExecucao.update({ where: { id: registro.id }, data: { status: 'OK', finalizadoEm: new Date(), detalhes: JSON.stringify(detalhes) } })
    return { ok: true, mensagem: 'Backup concluído' }
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'erro desconhecido'
    console.error('[backup] falhou', e)
    await prisma.backupExecucao.update({ where: { id: registro.id }, data: { status: 'ERRO', finalizadoEm: new Date(), erro } })
    await avisarMasters(`O backup automático falhou: ${erro.slice(0, 300)}`)
    return { ok: false, mensagem: erro }
  } finally {
    emExecucao = false
  }
}

// Verifica a cada 30 min: se ainda não houve backup bem-sucedido hoje (horário de Brasília), e
// já passou das 02h, tenta rodar — no máximo uma tentativa a cada 2 horas, para uma falha não
// virar um laço. Como a verificação é por "já houve hoje?", também compensa um dia em que o
// servidor estava fora do ar às 02h.
export function iniciarAgendadorBackup() {
  if (process.env.BACKUP_ATIVO !== 'true') return
  if (!driveConfigurado()) {
    console.warn('[backup] BACKUP_ATIVO=true mas o Google Drive não está configurado — agendador desligado')
    return
  }
  const verificar = async () => {
    try {
      const horaAgora = Number(new Date().toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }))
      if (horaAgora < 2) return
      const hoje = dataBrasilia()
      const ultimos = await prisma.backupExecucao.findMany({ orderBy: { iniciadoEm: 'desc' }, take: 5 })
      if (ultimos.some(u => u.status === 'OK' && dataBrasilia(u.iniciadoEm) === hoje)) return
      if (ultimos[0] && Date.now() - ultimos[0].iniciadoEm.getTime() < 2 * 3600_000) return
      await executarBackup('AGENDADO')
    } catch (e) {
      console.error('[backup] erro no agendador', e)
    }
  }
  setTimeout(verificar, 3 * 60_000)
  setInterval(verificar, 30 * 60_000)
  console.log('[backup] agendador ativo (diário, a partir das 02h de Brasília)')
}
