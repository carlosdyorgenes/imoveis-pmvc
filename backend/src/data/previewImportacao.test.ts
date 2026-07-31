import { describe, it, expect } from 'vitest'
import { previewImportacao } from './previewImportacao'

describe('prévia de importação do DOCX de pendências', () => {
  it('todo item sem GEP completo carrega um alerta explicando o motivo', () => {
    for (const item of previewImportacao.itens) {
      const gepIncompleto = !item.gepNumero || !item.gepAno
      if (gepIncompleto) {
        expect(item.alertas.length, `linha ${item.linha} (${item.interessado}) sem GEP completo deveria ter alerta`).toBeGreaterThan(0)
      }
    }
  })

  it('GEPs duplicados no documento estão sinalizados em ambos os lados', () => {
    const porGep = new Map<string, typeof previewImportacao.itens>()
    for (const item of previewImportacao.itens) {
      if (!item.gepNumero || !item.gepAno) continue
      const chave = `${item.gepNumero}/${item.gepAno}`
      porGep.set(chave, [...(porGep.get(chave) || []), item])
    }
    for (const [gep, itens] of porGep) {
      if (itens.length > 1) {
        for (const item of itens) {
          const temAlertaDuplicidade = item.alertas.some(a => a.includes('gep_duplicado'))
          expect(temAlertaDuplicidade, `GEP ${gep} duplicado (linha ${item.linha}) deveria estar sinalizado`).toBe(true)
        }
      }
    }
  })

  it('não contém nenhum item sem assunto', () => {
    for (const item of previewImportacao.itens) {
      expect(item.assunto?.trim(), `linha ${item.linha}`).toBeTruthy()
    }
  })
})
