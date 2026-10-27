// Detecta texto de IA guardado que ficou cortado no meio da frase (por limite de tokens): um
// texto completo termina em pontuação final. Usado para descartar/refazer textos salvos que
// foram gerados antes de o limite ser corrigido.
export function textoPareceCortado(texto: string | null | undefined): boolean {
  const limpo = (texto || '').trim()
  if (!limpo) return false
  return !/[.!?…)"”»\]]$/.test(limpo)
}
