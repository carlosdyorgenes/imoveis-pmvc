import { describe, it, expect } from 'vitest'
import { classificarArquivo, trechosNovos, formatarSecaoAnexos } from './anexos'

describe('classificarArquivo', () => {
  it('usa o mime quando confiável', () => {
    expect(classificarArquivo('application/pdf', 'x')).toBe('pdf')
    expect(classificarArquivo('image/jpeg', 'x')).toBe('imagem')
    expect(classificarArquivo('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x')).toBe('docx')
  })
  it('desempata pela extensão quando o mime é genérico', () => {
    expect(classificarArquivo('application/octet-stream', 'parecer.PDF')).toBe('pdf')
    expect(classificarArquivo('application/octet-stream', 'planta.dwg')).toBe('outro')
  })
  it('zip e rar não são lidos', () => {
    expect(classificarArquivo('application/x-zip-compressed', 'a.zip')).toBe('outro')
    expect(classificarArquivo('application/x-compressed', 'a.rar')).toBe('outro')
  })
})

describe('trechosNovos', () => {
  const v1 = 'Memorial descritivo do imóvel situado no bairro Candeias.\nÁrea total de 1.200 metros quadrados.\n1'
  it('devolve só o que foi acrescentado', () => {
    const v2 = v1 + '\nFoi incluída a confrontação com a rua dos Ipês, lado direito.\n2'
    expect(trechosNovos(v1, v2)).toBe('Foi incluída a confrontação com a rua dos Ipês, lado direito.')
  })
  it('ignora diferenças de caixa, acento e pontuação', () => {
    expect(trechosNovos(v1, 'MEMORIAL DESCRITIVO DO IMOVEL SITUADO NO BAIRRO CANDEIAS')).toBe('')
  })
  it('não repete a mesma linha nova', () => {
    const nova = 'Parágrafo totalmente inédito neste documento.'
    expect(trechosNovos(v1, `${nova}\n${nova}`)).toBe(nova)
  })
  it('texto idêntico não gera nada', () => {
    expect(trechosNovos(v1, v1)).toBe('')
  })
})

describe('formatarSecaoAnexos', () => {
  it('vazio sem anexos', () => {
    expect(formatarSecaoAnexos([])).toBe('')
  })
  it('marca atualizações como acréscimo', () => {
    const s = formatarSecaoAnexos([
      { atividadeTitulo: 'Planta', nome: 'Memorial', versao: 1, ehAtualizacao: false, resumo: 'Descreve a área.' },
      { atividadeTitulo: 'Planta', nome: 'Memorial', versao: 2, ehAtualizacao: true, resumo: 'Inclui confrontação.' },
    ])
    expect(s).toContain('"Memorial":')
    expect(s).toContain('ATUALIZAÇÃO (v2), somente o que foi acrescentado')
  })
})
