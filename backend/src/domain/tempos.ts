// Cálculo puro dos indicadores de tempo de uma atividade — extraído para ser testável sem banco.
// Tempo de espera: atribuição (createdAt) até início (dataInicio).
// Tempo de execução: início (dataInicio) até conclusão (dataConclusao).
// Tempo total no setor: atribuição (createdAt) até conclusão (dataConclusao).
// Enquanto uma data não existe, o intervalo correspondente é calculado até "agora" (em andamento).

export interface DuracaoFormatada {
  minutos: number
  texto: string
}

export function formatarDuracao(inicioMs: number, fimMs: number): DuracaoFormatada {
  const totalMinutos = Math.max(0, Math.round((fimMs - inicioMs) / 60000))
  const dias = Math.floor(totalMinutos / 1440)
  const horas = Math.floor((totalMinutos % 1440) / 60)
  const minutos = totalMinutos % 60

  const partes: string[] = []
  if (dias > 0) partes.push(`${dias}d`)
  if (horas > 0) partes.push(`${horas}h`)
  if (minutos > 0 || partes.length === 0) partes.push(`${minutos}min`)

  return { minutos: totalMinutos, texto: partes.join(' ') }
}

export function calcularTemposAtividade(
  createdAt: Date,
  dataInicio: Date | null,
  dataConclusao: Date | null,
  agora: Date = new Date()
) {
  const tempoEspera = formatarDuracao(createdAt.getTime(), (dataInicio ?? agora).getTime())
  const tempoExecucao = dataInicio
    ? formatarDuracao(dataInicio.getTime(), (dataConclusao ?? agora).getTime())
    : null
  const tempoTotal = formatarDuracao(createdAt.getTime(), (dataConclusao ?? agora).getTime())

  return { tempoEspera, tempoExecucao, tempoTotal }
}
