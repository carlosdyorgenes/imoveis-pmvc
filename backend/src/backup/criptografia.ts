import fs from 'fs'
import crypto from 'crypto'

// Formato do arquivo criptografado: [IV 12 bytes][conteúdo cifrado][tag de autenticação 16 bytes]
// (AES-256-GCM). A chave nunca vai para o Drive — sem ela o backup não abre, por isso ela
// precisa ser guardada também fora do servidor.
const TAM_IV = 12
const TAM_TAG = 16

export function chaveDeBackup(valor = process.env.BACKUP_ENCRYPTION_KEY): Buffer {
  if (!valor) throw new Error('BACKUP_ENCRYPTION_KEY não configurada')
  const chave = Buffer.from(valor, 'base64')
  if (chave.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY deve ter 32 bytes em base64')
  return chave
}

export function criptografarArquivo(origem: string, destino: string, chave: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const iv = crypto.randomBytes(TAM_IV)
    const cifrador = crypto.createCipheriv('aes-256-gcm', chave, iv)
    const entrada = fs.createReadStream(origem)
    const saida = fs.createWriteStream(destino)
    const falhar = (e: Error) => reject(e)
    entrada.on('error', falhar)
    cifrador.on('error', falhar)
    saida.on('error', falhar)
    saida.on('finish', () => resolve())
    saida.write(iv)
    entrada.pipe(cifrador)
    cifrador.pipe(saida, { end: false })
    cifrador.on('end', () => {
      saida.write(cifrador.getAuthTag())
      saida.end()
    })
  })
}

export async function descriptografarArquivo(origem: string, destino: string, chave: Buffer): Promise<void> {
  const tamanho = fs.statSync(origem).size
  if (tamanho < TAM_IV + TAM_TAG) throw new Error('Arquivo criptografado inválido (muito pequeno)')
  const fd = fs.openSync(origem, 'r')
  const iv = Buffer.alloc(TAM_IV)
  const tag = Buffer.alloc(TAM_TAG)
  fs.readSync(fd, iv, 0, TAM_IV, 0)
  fs.readSync(fd, tag, 0, TAM_TAG, tamanho - TAM_TAG)
  fs.closeSync(fd)

  const decifrador = crypto.createDecipheriv('aes-256-gcm', chave, iv)
  decifrador.setAuthTag(tag)
  if (tamanho === TAM_IV + TAM_TAG) {
    decifrador.final()
    fs.writeFileSync(destino, '')
    return
  }
  await new Promise<void>((resolve, reject) => {
    const entrada = fs.createReadStream(origem, { start: TAM_IV, end: tamanho - TAM_TAG - 1 })
    const saida = fs.createWriteStream(destino)
    entrada.on('error', reject)
    decifrador.on('error', reject)
    saida.on('error', reject)
    saida.on('finish', () => resolve())
    entrada.pipe(decifrador).pipe(saida)
  })
}
