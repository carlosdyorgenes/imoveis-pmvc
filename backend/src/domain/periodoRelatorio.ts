// "Período" do Relatório Geral = um dia (horário de Brasília). Todas as gerações do mesmo dia
// (PDF, Word, Excel, ou várias vezes) comparam a demanda com a MESMA base — o estado em que ela
// estava na última geração de um dia anterior — e por isso mostram as mesmas atualizações. A
// base só avança na primeira geração de um novo dia.

export interface CacheDoPeriodo {
  assinatura: string
  assinaturaAnexos: string | null
  atualizadoEm: Date
  baseAssinatura: string | null
  baseAssinaturaAnexos: string | null
  baseEm: Date | null
}

export interface BaseDoPeriodo {
  assinatura: string
  // null = base anterior ao recurso de leitura de anexos (diferença de anexos não conta)
  anexos: string | null
  // Quando a demanda estava nesse estado; null = demanda ainda sem relatório anterior
  em: Date | null
  // true = a base mudou nesta geração e precisa ser gravada
  precisaGravar: boolean
}

// Valor de base que nunca coincide com uma assinatura real: demanda nova sempre aparece como
// atualizada.
export const BASE_SEM_RELATORIO_ANTERIOR = ''

export function resolverBase(cache: CacheDoPeriodo | null, hojeBrasilia: string, dataBrasilia: (d: Date) => string): BaseDoPeriodo {
  if (!cache) return { assinatura: BASE_SEM_RELATORIO_ANTERIOR, anexos: '', em: null, precisaGravar: true }
  const novoDia = dataBrasilia(cache.atualizadoEm) < hojeBrasilia
  if (cache.baseAssinatura === null || novoDia) {
    return { assinatura: cache.assinatura, anexos: cache.assinaturaAnexos, em: cache.atualizadoEm, precisaGravar: true }
  }
  return { assinatura: cache.baseAssinatura, anexos: cache.baseAssinaturaAnexos, em: cache.baseEm, precisaGravar: false }
}

export function houveAtualizacao(base: BaseDoPeriodo, atual: { assinatura: string; anexos: string }): boolean {
  if (base.assinatura !== atual.assinatura) return true
  return base.anexos !== null && base.anexos !== atual.anexos
}
