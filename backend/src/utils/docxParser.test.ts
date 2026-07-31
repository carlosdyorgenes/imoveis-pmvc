import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { extrairParagrafosDocx, extrairItensCandidatos } from './docxParser'

// Gera um .docx mínimo válido em memória (mesmo formato ZIP+XML de um Word real),
// para testar o parser sem depender de um arquivo fixo no disco.
async function criarDocxDeTeste(paragrafos: string[]): Promise<Buffer> {
  const zip = new JSZip()
  const corpo = paragrafos
    .map(p => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join('')
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${corpo}</w:body>
</w:document>`
  zip.file('word/document.xml', documentXml)
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('extrairParagrafosDocx', () => {
  it('extrai o texto de cada parágrafo de um .docx real (gerado em memória)', async () => {
    const buffer = await criarDocxDeTeste(['Primeiro parágrafo', 'Segundo parágrafo', ''])
    const paragrafos = await extrairParagrafosDocx(buffer)
    expect(paragrafos).toEqual(['Primeiro parágrafo', 'Segundo parágrafo'])
  })

  it('rejeita um arquivo que não é um .docx válido', async () => {
    const bufferInvalido = Buffer.from('isto não é um zip')
    await expect(extrairParagrafosDocx(bufferInvalido)).rejects.toThrow()
  })
})

describe('extrairItensCandidatos', () => {
  it('encontra o padrão GEP (numero/ano) e monta um item de prévia', () => {
    const paragrafos = ['1- Vila Elisa (126158/2025): revalidação de alvará']
    const itens = extrairItensCandidatos(paragrafos)
    expect(itens).toHaveLength(1)
    expect(itens[0].gepNumero).toBe('126158')
    expect(itens[0].gepAno).toBe('2025')
    expect(itens[0].alertas.some(a => a.includes('revise'))).toBe(true)
  })

  it('ignora parágrafos sem nenhum padrão de GEP', () => {
    const itens = extrairItensCandidatos(['Apenas um comentário qualquer, sem número de processo'])
    expect(itens).toHaveLength(0)
  })

  it('sinaliza ano fora do intervalo plausível', () => {
    const itens = extrairItensCandidatos(['Processo antigo 12345/1850'])
    expect(itens[0].alertas.some(a => a.includes('ano_suspeito'))).toBe(true)
  })
})
