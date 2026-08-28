'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { BarChart3, FileText, FileSpreadsheet, Download, Users, Timer, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

function formatarMinutos(min: number | null) {
  if (min === null) return '—'
  const dias = Math.floor(min / 1440)
  const horas = Math.floor((min % 1440) / 60)
  if (dias > 0) return `${dias}d ${horas}h`
  if (horas > 0) return `${horas}h ${min % 60}min`
  return `${min}min`
}

interface Indicadores {
  tempoMedioPorArea: { area: string; tempoMedioEsperaMin: number | null; tempoMedioExecucaoMin: number | null }[]
  cargaPorUsuario: { nome: string; ativas: number }[]
  totalTransferidas: number
  totalDevolvidas: number
  totalConcluidas: number
  totalArquivadas: number
  totalSemMovimentacao: number
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface ReportConfig {
  title: string
  description: string
  icon: React.ReactNode
  filters?: React.ReactNode
  pdfEndpoint: string
  excelEndpoint?: string
  pdfFilename: string
  excelFilename?: string
}

export default function RelatoriosPage() {
  const [loadingReport, setLoadingReport] = useState<string | null>(null)
  const [tipo, setTipo] = useState('')
  const [zona, setZona] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [statusGeral, setStatusGeral] = useState('')
  const { isMaster } = useAuth()

  const { data: indicadores } = useQuery<Indicadores>({
    queryKey: ['demandas-indicadores'],
    queryFn: () => api.get('/api/relatorios/demandas/indicadores').then(r => r.data),
    enabled: isMaster,
  })

  const handleDownload = async (endpoint: string, filename: string, reportKey: string) => {
    setLoadingReport(reportKey + filename)
    try {
      const params: Record<string, string> = {}
      if (tipo && endpoint.includes('imoveis')) params.tipo = tipo
      if (zona && endpoint.includes('imoveis')) params.zona = zona
      if (fromDate && endpoint.includes('ocorrencias')) params.from = fromDate
      if (toDate && endpoint.includes('ocorrencias')) params.to = toDate
      if (statusGeral && endpoint.includes('geral')) params.status = statusGeral

      // O Relatório Geral roda uma análise por IA pra cada demanda — pode levar bem mais tempo
      // que os demais relatórios (que só consultam o banco), então usa um timeout bem maior.
      const timeout = endpoint.includes('geral') ? 10 * 60_000 : undefined

      const res = await api.get(endpoint, { responseType: 'blob', params, timeout })
      downloadBlob(res.data, filename)
      toast.success('Relatório gerado!')
    } catch { toast.error('Erro ao gerar relatório') }
    finally { setLoadingReport(null) }
  }

  const reports: ReportConfig[] = [
    ...(isMaster ? [{
      title: 'Relatório Geral',
      description: 'Análise por IA da situação atual de cada demanda (Claude, com ChatGPT como alternativa) — pode levar alguns minutos',
      icon: <Sparkles className="w-5 h-5 text-indigo-500" />,
      pdfEndpoint: '/api/relatorios/geral/pdf',
      excelEndpoint: '/api/relatorios/geral/excel',
      pdfFilename: 'relatorio_geral_demandas.pdf',
      excelFilename: 'relatorio_geral_demandas.xlsx',
      filters: (
        <select className="input text-xs w-auto" value={statusGeral} onChange={e => setStatusGeral(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="ABERTA">Aberta</option>
          <option value="EM_ANDAMENTO">Em andamento</option>
          <option value="PARCIALMENTE_CONCLUIDA">Parcialmente concluída</option>
          <option value="AGUARDANDO_TERCEIRO">Aguardando terceiro</option>
          <option value="DEVOLVIDA">Devolvida</option>
          <option value="CONCLUIDA">Concluída</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
      )
    } as ReportConfig] : []),
    {
      title: 'Relatório de Imóveis',
      description: 'Lista completa de imóveis com filtros por tipo, zona e secretaria',
      icon: <BarChart3 className="w-5 h-5 text-blue-500" />,
      pdfEndpoint: '/api/relatorios/imoveis/pdf',
      excelEndpoint: '/api/relatorios/imoveis/excel',
      pdfFilename: 'relatorio_imoveis.pdf',
      excelFilename: 'relatorio_imoveis.xlsx',
      filters: (
        <div className="flex gap-2 flex-wrap">
          <select className="input text-xs w-auto" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="PROPRIO">Próprio</option>
            <option value="LOCADO">Locado</option>
          </select>
          <select className="input text-xs w-auto" value={zona} onChange={e => setZona(e.target.value)}>
            <option value="">Todas as zonas</option>
            <option value="URBANO">Urbano</option>
            <option value="RURAL">Rural</option>
          </select>
        </div>
      )
    },
    {
      title: 'Ficha de Ocorrências',
      description: 'Histórico de todas as ocorrências com filtro por período',
      icon: <FileText className="w-5 h-5 text-purple-500" />,
      pdfEndpoint: '/api/relatorios/ocorrencias/pdf',
      excelEndpoint: '/api/relatorios/ocorrencias/excel',
      pdfFilename: 'relatorio_ocorrencias.pdf',
      excelFilename: 'relatorio_ocorrencias.xlsx',
      filters: (
        <div className="flex gap-2 flex-wrap items-center">
          <label className="text-xs text-gray-500">De:</label>
          <input type="date" className="input text-xs w-auto" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <label className="text-xs text-gray-500">Até:</label>
          <input type="date" className="input text-xs w-auto" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
      )
    },
    {
      title: 'Relatório de Tarefas',
      description: 'Status atual das tarefas do kanban com imóveis por etapa',
      icon: <BarChart3 className="w-5 h-5 text-emerald-500" />,
      pdfEndpoint: '/api/relatorios/tarefas/pdf',
      excelEndpoint: '/api/relatorios/tarefas/excel',
      pdfFilename: 'relatorio_tarefas.pdf',
      excelFilename: 'relatorio_tarefas.xlsx',
    },
    {
      title: 'Resumo Geral',
      description: 'Visão consolidada com totais por tipo, zona e estatísticas gerais',
      icon: <FileText className="w-5 h-5 text-amber-500" />,
      pdfEndpoint: '/api/relatorios/resumo/pdf',
      pdfFilename: 'relatorio_resumo.pdf',
    },
  ]

  if (!isMaster) return <div className="p-8 text-center text-gray-400">Acesso restrito ao administrador</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-gray-500 mt-0.5">Exporte dados em PDF ou Excel</p>
      </div>

      {isMaster && indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="card">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
              <Timer className="w-4 h-4 text-primary-600" /> Tempo médio por área
            </h3>
            {indicadores.tempoMedioPorArea.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Sem dados suficientes ainda</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-1.5 font-medium">Área</th>
                    <th className="py-1.5 font-medium">Espera</th>
                    <th className="py-1.5 font-medium">Execução</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {indicadores.tempoMedioPorArea.map(a => (
                    <tr key={a.area}>
                      <td className="py-1.5 text-gray-700">{a.area}</td>
                      <td className="py-1.5 text-gray-500">{formatarMinutos(a.tempoMedioEsperaMin)}</td>
                      <td className="py-1.5 text-gray-500">{formatarMinutos(a.tempoMedioExecucaoMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-primary-600" /> Carga de tarefas ativas por usuário
            </h3>
            {indicadores.cargaPorUsuario.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Nenhuma tarefa ativa no momento</p>
            ) : (
              <div className="space-y-1.5">
                {indicadores.cargaPorUsuario.map(u => (
                  <div key={u.nome} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{u.nome}</span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{u.ativas} ativa(s)</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card md:col-span-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div><p className="text-xl font-bold text-gray-800">{indicadores.totalConcluidas}</p><p className="text-[11px] text-gray-500">Concluídas</p></div>
              <div><p className="text-xl font-bold text-gray-800">{indicadores.totalArquivadas}</p><p className="text-[11px] text-gray-500">Canceladas</p></div>
              <div><p className="text-xl font-bold text-orange-600">{indicadores.totalDevolvidas}</p><p className="text-[11px] text-gray-500">Já devolvidas</p></div>
              <div><p className="text-xl font-bold text-blue-600">{indicadores.totalTransferidas}</p><p className="text-[11px] text-gray-500">Transferências</p></div>
              <div><p className="text-xl font-bold text-red-600">{indicadores.totalSemMovimentacao}</p><p className="text-[11px] text-gray-500">Sem movimentação 15d+</p></div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map(report => (
          <div key={report.title} className="card">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                {report.icon}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{report.title}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{report.description}</p>
              </div>
            </div>

            {report.filters && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-2">Filtros:</p>
                {report.filters}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleDownload(report.pdfEndpoint, report.pdfFilename, report.title)}
                disabled={!!loadingReport}
                className="btn-primary text-xs flex-1 justify-center"
              >
                {loadingReport === report.title + report.pdfFilename ? (
                  'Gerando...'
                ) : (
                  <><FileText className="w-3.5 h-3.5" /> PDF</>
                )}
              </button>
              {report.excelEndpoint && (
                <button
                  onClick={() => handleDownload(report.excelEndpoint!, report.excelFilename!, report.title)}
                  disabled={!!loadingReport}
                  className="btn-secondary text-xs flex-1 justify-center"
                >
                  {loadingReport === report.title + report.excelFilename ? (
                    'Gerando...'
                  ) : (
                    <><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
