import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { chaveDeBackup, criptografarArquivo, descriptografarArquivo } from './criptografia'

const chave = crypto.randomBytes(32)

function tmp(nome: string) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bk-')), nome)
}

describe('criptografia de backup', () => {
  it('criptografa e descriptografa devolvendo o conteúdo original', async () => {
    const original = tmp('orig.bin')
    const conteudo = crypto.randomBytes(3 * 1024 * 1024 + 17)
    fs.writeFileSync(original, conteudo)
    const cifrado = tmp('orig.enc')
    const volta = tmp('volta.bin')
    await criptografarArquivo(original, cifrado, chave)
    expect(fs.readFileSync(cifrado).includes(conteudo.subarray(0, 64))).toBe(false)
    await descriptografarArquivo(cifrado, volta, chave)
    expect(fs.readFileSync(volta).equals(conteudo)).toBe(true)
  })

  it('arquivo vazio também funciona', async () => {
    const original = tmp('vazio.bin')
    fs.writeFileSync(original, '')
    const cifrado = tmp('vazio.enc')
    const volta = tmp('vazio-volta.bin')
    await criptografarArquivo(original, cifrado, chave)
    await descriptografarArquivo(cifrado, volta, chave)
    expect(fs.readFileSync(volta).length).toBe(0)
  })

  it('chave errada ou arquivo adulterado falha', async () => {
    const original = tmp('a.bin')
    fs.writeFileSync(original, 'conteudo sigiloso do backup')
    const cifrado = tmp('a.enc')
    await criptografarArquivo(original, cifrado, chave)
    await expect(descriptografarArquivo(cifrado, tmp('x.bin'), crypto.randomBytes(32))).rejects.toThrow()
    const bytes = fs.readFileSync(cifrado)
    bytes[20] ^= 0xff
    fs.writeFileSync(cifrado, bytes)
    await expect(descriptografarArquivo(cifrado, tmp('y.bin'), chave)).rejects.toThrow()
  })

  it('valida a chave do ambiente', () => {
    expect(() => chaveDeBackup(undefined)).toThrow()
    expect(() => chaveDeBackup(Buffer.from('curta').toString('base64'))).toThrow()
    expect(chaveDeBackup(chave.toString('base64')).length).toBe(32)
  })
})
