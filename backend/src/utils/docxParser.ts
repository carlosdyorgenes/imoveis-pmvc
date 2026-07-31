import JSZip from 'jszip'

// Extrai o texto de cada parágrafo de um .docx genérico (qualquer arquivo Word real,
// não só o documento de referência específico). Um .docx é um ZIP contendo XML —
// aqui abrimos o ZIP e isolamos o texto de cada <w:p>...</w:p> em word/document.xml.
export async function extrairParagrafosDocx(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer)
  const documentXmlFile = zip.file('word/document.xml')
  if (!documentXmlFile) throw new Error('Arquivo não é um .docx válido (word/document.xml não encontrado)')

  const xml = await documentXmlFile.async('string')
  const paragrafos = xml.split(/<\/w:p>/)

  const textos: string[] = []
  for (const paragrafo of paragrafos) {
    const runs = [...paragrafo.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gs)].map(m => m[1])
    const texto = runs.join('').trim()
    if (texto) textos.push(texto)
  }
  return textos
}

export interface ItemExtraido {
  linha: number
  textoOriginal: string
  gepNumero: string | null
  gepAno: string | null
  interessado: string | null
  assunto: string
  alertas: string[]
}

// Heurística best-effort: procura padrões "NNNNN/AAAA" (GEP) em cada parágrafo e monta
// um item de prévia por parágrafo que contém um GEP. NÃO é um parser estruturado —
// é um ponto de partida para revisão manual antes de confirmar a importação
// (mesma regra de sempre: GEP incompleto é rejeitado por POST /importar/confirmar).
export function extrairItensCandidatos(paragrafos: string[]): ItemExtraido[] {
  const GEP_REGEX = /(\d{3,7})\s*\/\s*(\d{4})/

  const itens: ItemExtraido[] = []
  paragrafos.forEach((texto, idx) => {
    const match = texto.match(GEP_REGEX)
    if (!match) return

    const [, gepNumero, gepAno] = match
    const alertas: string[] = ['extraido_automaticamente: revise antes de confirmar a importação']

    // Tenta separar "Nome/interessado" do restante quando o texto começa com
    // "N- Interessado (GEP...)" ou "Interessado (GEP...)" — padrão comum em listas manuais.
    const antesDoGep = texto.slice(0, match.index).replace(/^\d+\s*[-–.)]\s*/, '').trim()
    const interessado = antesDoGep.length > 0 && antesDoGep.length < 80 ? antesDoGep.replace(/[(:]+$/, '').trim() : null

    const anoNum = parseInt(gepAno, 10)
    if (anoNum < 1990 || anoNum > new Date().getFullYear() + 2) {
      alertas.push(`ano_suspeito: ${gepAno} está fora do intervalo esperado — confirme se é mesmo o ano do GEP`)
    }

    itens.push({
      linha: idx + 1,
      textoOriginal: texto,
      gepNumero,
      gepAno,
      interessado,
      assunto: texto.length > 150 ? texto.slice(0, 150) + '…' : texto,
      alertas,
    })
  })
  return itens
}
