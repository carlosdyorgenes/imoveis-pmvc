'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { BarChart3, FileText, FileSpreadsheet, Download } from 'lucide-react'
import toast from 'react-hot-toast'

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

  const handleDownload = async (endpoint: string, filename: string, reportKey: string) => {
    setLoadingReport(reportKey + filename)
    try {
      const params: Record<string, string> = {}
      if (tipo && endpoint.includes('imoveis')) params.tipo = tipo
      if (zona && endpoint.includes('imoveis')) params.zona = zona
      if (fromDate && endpoint.includes('ocorrencias')) params.from = fromDate
      if (toDate && endpoint.includes('ocorrencias')) params.to = toDate

      const res = await api.get(endpoint, { responseType: 'blob', params })
      downloadBlob(res.data, filename)
      toast.success('Relatório gerado!')
    } catch { toast.error('Erro ao gerar relatório') }
    finally { setLoadingReport(null) }
  }

  const reports: ReportConfig[] = [
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-gray-500 mt-0.5">Exporte dados em PDF ou Excel</p>
      </div>

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
