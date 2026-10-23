export interface EventoNovo { acao: string; descricao: string }
export interface AnexoNovo { nome: string; atividadeTitulo: string; ehAtualizacao: boolean; resumo: string }

const MAX_CHARS_ITEM = 300
const MAX_CHARS_RESUMO_ANEXO = 400
const MAX_ITENS = 25

const cortar = (t: string, max: number) => {
  const limpo = t.replace(/\s+/g, ' ').trim()
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo
}

export interface NovidadesDaDemanda {
  // Textos COMPLETOS das informações registradas na linha do tempo (vão literais para os destaques).
  informacoes: string[]
  // Novos documentos (já lidos e resumidos) e demais movimentações, em linhas curtas.
  demais: string[]
}

// Reúne o que entrou numa demanda desde a última geração do relatório. As informações da
// linha do tempo ficam inteiras (sem cortar); anexos e movimentações viram linhas curtas,
// sem repetições.
export function montarNovidades(eventos: EventoNovo[], anexos: AnexoNovo[], acaoInformacao = 'INFORMACAO'): NovidadesDaDemanda {
  const informacoes = eventos
    .filter(e => e.acao === acaoInformacao)
    .map(e => e.descricao.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const docs = anexos
    .filter(a => a.resumo.trim())
    .map(a => a.ehAtualizacao
      ? `Nova versão de documento anexado à atividade "${a.atividadeTitulo}", acréscimos: ${cortar(a.resumo, MAX_CHARS_RESUMO_ANEXO)}`
      : `Novo documento anexado à atividade "${a.atividadeTitulo}": ${cortar(a.resumo, MAX_CHARS_RESUMO_ANEXO)}`)
  const outros = eventos.filter(e => e.acao !== acaoInformacao).map(e => cortar(e.descricao, MAX_CHARS_ITEM))

  const vistos = new Set<string>()
  const demais: string[] = []
  for (const item of [...docs, ...outros]) {
    if (!item || vistos.has(item)) continue
    vistos.add(item)
    demais.push(item)
  }
  return { informacoes, demais: demais.slice(0, MAX_ITENS) }
}
