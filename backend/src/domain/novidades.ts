export interface EventoNovo { acao: string; descricao: string }
export interface AnexoNovo { nome: string; atividadeTitulo: string; ehAtualizacao: boolean; resumo: string }

const MAX_CHARS_ITEM = 300
const MAX_CHARS_RESUMO_ANEXO = 400
const MAX_ITENS = 25

const cortar = (t: string, max: number) => {
  const limpo = t.replace(/\s+/g, ' ').trim()
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo
}

// Reúne, em linhas curtas, o que entrou numa demanda desde a última geração do relatório:
// informações registradas na linha do tempo, anexos novos (já lidos e resumidos) e demais
// movimentações. É a base dos "Destaques do período". Informações vêm primeiro, depois os
// anexos, depois as movimentações; repetições são descartadas.
export function montarNovidades(eventos: EventoNovo[], anexos: AnexoNovo[], acaoInformacao = 'INFORMACAO'): string[] {
  const informacoes = eventos.filter(e => e.acao === acaoInformacao).map(e => `Informação registrada na linha do tempo: ${cortar(e.descricao, MAX_CHARS_ITEM)}`)
  const docs = anexos
    .filter(a => a.resumo.trim())
    .map(a => a.ehAtualizacao
      ? `Nova versão de documento anexado à atividade "${a.atividadeTitulo}", acréscimos: ${cortar(a.resumo, MAX_CHARS_RESUMO_ANEXO)}`
      : `Novo documento anexado à atividade "${a.atividadeTitulo}": ${cortar(a.resumo, MAX_CHARS_RESUMO_ANEXO)}`)
  const outros = eventos.filter(e => e.acao !== acaoInformacao).map(e => cortar(e.descricao, MAX_CHARS_ITEM))

  const vistos = new Set<string>()
  const itens: string[] = []
  for (const item of [...informacoes, ...docs, ...outros]) {
    if (!item || vistos.has(item)) continue
    vistos.add(item)
    itens.push(item)
  }
  return itens.slice(0, MAX_ITENS)
}
