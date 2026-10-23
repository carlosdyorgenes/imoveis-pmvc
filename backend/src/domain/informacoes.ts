export const ACAO_INFORMACAO = 'INFORMACAO'
export const MAX_CHARS_INFORMACAO = 2000

// Seção "informações registradas pelo Master na linha do tempo" que entra no texto enviado à
// IA (Resumo da demanda e Relatório Geral). Só o texto, na ordem em que foram registradas —
// sem datas nem autores, como pedem os prompts.
export function formatarSecaoInformacoes(textos: string[]): string {
  const validos = textos.map(t => t.trim()).filter(Boolean)
  if (validos.length === 0) return ''
  return ['INFORMAÇÕES COMPLEMENTARES REGISTRADAS NA DEMANDA (linha do tempo):', ...validos.map(t => `- ${t.replace(/\s+/g, ' ')}`)].join('\n')
}

export const REGRA_INFORMACOES_PROMPT = `

INFORMAÇÕES COMPLEMENTARES
Quando o texto de entrada trouxer a seção "INFORMAÇÕES COMPLEMENTARES REGISTRADAS NA DEMANDA", ela contém fatos pontuais registrados diretamente pela gerência, fora das atividades. Trate-os como informação oficial e incorpore ao texto o que for relevante, de forma consolidada, sem copiar literalmente e sem mencionar a existência da seção. Não os atribua a nenhuma atividade específica, a menos que o próprio texto indique.`
