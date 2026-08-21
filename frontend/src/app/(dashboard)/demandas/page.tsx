'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Demanda, StatusDemanda, Prioridade, Equipe } from '@/types'
import Link from 'next/link'
import { Plus, Search, X, FileStack, AlertTriangle, Download, FileSpreadsheet, ClipboardCheck, Inbox, List, Columns3, Trash2, ArrowUp, Minus, ArrowDown, Timer, RotateCcw, TrendingUp, TrendingDown, CheckCircle2, Gauge } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

const STATUS_LABEL: Record<StatusDemanda, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  PARCIALMENTE_CONCLUIDA: 'Parcialmente concluída',
  AGUARDANDO_TERCEIRO: 'Aguardando terceiro',
  DEVOLVIDA: 'Devolvida',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
}

const STATUS_COLOR: Record<StatusDemanda, string> = {
  ABERTA: 'bg-gray-100 text-gray-600',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  PARCIALMENTE_CONCLUIDA: 'bg-indigo-100 text-indigo-700',
  AGUARDANDO_TERCEIRO: 'bg-amber-100 text-amber-700',
  DEVOLVIDA: 'bg-orange-100 text-orange-700',
  CONCLUIDA: 'bg-green-100 text-green-700',
  CANCELADA: 'bg-red-100 text-red-700',
}

const PRIORIDADE_LABEL: Record<Prioridade, string> = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' }
const PRIORIDADE_COLOR: Record<Prioridade, string> = {
  ALTA: 'bg-red-100 text-red-700',
  MEDIA: 'bg-amber-100 text-amber-700',
  BAIXA: 'bg-gray-100 text-gray-600',
}
const PRIORIDADE_ICONE: Record<Prioridade, typeof ArrowUp> = { ALTA: ArrowUp, MEDIA: Minus, BAIXA: ArrowDown }

function BadgePrioridade({ prioridade }: { prioridade: Prioridade }) {
  const Icone = PRIORIDADE_ICONE[prioridade]
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PRIORIDADE_COLOR[prioridade]}`}>
      <Icone className="w-3 h-3" /> {PRIORIDADE_LABEL[prioridade]}
    </span>
  )
}

// Status "real" da demanda (usado pelo administrador) considera todos os setores. Mas um
// setor cuja atividade já foi aprovada, sem nenhuma pendência nova atribuída a ele, deve ver
// a demanda como Concluída do ponto de vista dele — mesmo que ela ainda esteja em andamento
// em outro setor (ex.: uma nova atividade foi criada para o Jurídico depois que a Engenharia
// já tinha concluído a parte dela). Usa o mesmo critério de "envolvido" da visibilidade por
// equipe: responsável direto OU qualquer atividade da(s) equipe(s) do usuário.
function statusPercebido(d: Demanda, isMaster: boolean, userId: string | undefined, equipes: Equipe[]): StatusDemanda {
  if (isMaster || !userId) return d.status
  if (['CONCLUIDA', 'CANCELADA'].includes(d.status)) return d.status
  const minhasEquipeIds = equipes.filter(e => e.membros.some(m => m.user.id === userId)).map(e => e.id)
  const minhasAtividades = (d.atividades || []).filter((a: any) =>
    a.responsavelId === userId || (a.equipe && minhasEquipeIds.includes(a.equipe.id))
  )
  if (minhasAtividades.length === 0) return d.status
  const meuSetorConcluido = minhasAtividades.every((a: any) => ['APROVADA', 'CANCELADA'].includes(a.status))
  return meuSetorConcluido ? 'CONCLUIDA' : d.status
}

export default function DemandasPage() {
  const qc = useQueryClient()
  const { isMaster, user } = useAuth()
  const [gepBusca, setGepBusca] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [gepNumero, setGepNumero] = useState('')
  const [gepAno, setGepAno] = useState(String(new Date().getFullYear()))
  const [assunto, setAssunto] = useState('')
  const [interessado, setInteressado] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prioridade, setPrioridade] = useState<Prioridade>('MEDIA')
  const [duplicado, setDuplicado] = useState<{ mensagem: string; demandaExistenteId: string } | null>(null)

  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState('')
  const [somenteAtrasadas, setSomenteAtrasadas] = useState(false)
  const [somenteAtividadesAtrasadas, setSomenteAtividadesAtrasadas] = useState(false)
  const [visualizacao, setVisualizacao] = useState<'lista' | 'kanban'>('lista')
  const router = useRouter()

  const { data: demandas = [], isLoading } = useQuery<Demanda[]>({
    queryKey: ['demandas', gepBusca, filtroStatus, filtroPrioridade, somenteAtrasadas, somenteAtividadesAtrasadas],
    queryFn: () => api.get('/api/demandas', {
      params: {
        ...(gepBusca ? { busca: gepBusca } : {}),
        ...(filtroStatus ? { status: filtroStatus } : {}),
        ...(filtroPrioridade ? { prioridade: filtroPrioridade } : {}),
        ...(somenteAtrasadas ? { atrasadas: 'true' } : {}),
        ...(somenteAtividadesAtrasadas ? { atividadesAtrasadas: 'true' } : {}),
      },
    }).then(r => r.data),
  })

  const baixarRelatorio = async (formato: 'pdf' | 'excel') => {
    try {
      const res = await api.get(`/api/relatorios/demandas/${formato}`, {
        params: { ...(filtroStatus ? { status: filtroStatus } : {}) },
        responseType: 'blob',
      })
      downloadBlob(res.data, `relatorio_demandas.${formato === 'pdf' ? 'pdf' : 'xlsx'}`)
    } catch {
      toast.error('Erro ao gerar relatório')
    }
  }

  const fecharModal = () => {
    setShowModal(false); setDuplicado(null)
    setGepNumero(''); setAssunto(''); setInteressado(''); setDescricao(''); setPrioridade('MEDIA')
  }

  const createMutation = useMutation({
    mutationFn: (confirmarDuplicado?: boolean) => api.post('/api/demandas', {
      gepNumero, gepAno, assunto, interessado, descricao, prioridade,
      ...(confirmarDuplicado ? { confirmarDuplicado: true } : {}),
    }),
    onSuccess: () => {
      toast.success('Demanda criada')
      qc.invalidateQueries({ queryKey: ['demandas'] })
      fecharModal()
    },
    onError: (e: any) => {
      // GEP duplicado: a API bloqueia (409) e devolve o id da demanda existente — oferece
      // a opção de abrir a demanda já cadastrada em vez de criar silenciosamente uma nova.
      if (e?.response?.status === 409 && e.response.data?.demandaExistenteId) {
        setDuplicado({ mensagem: e.response.data.error, demandaExistenteId: e.response.data.demandaExistenteId })
        return
      }
      toast.error(errMsg(e, 'Erro ao criar demanda'))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/demandas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandas'] }); toast.success('Demanda excluída') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao excluir demanda'))
  })

  const handleDelete = (id: string, gep: string) => {
    if (confirm(`Excluir definitivamente a demanda GEP ${gep}?\n\nIsso apaga também todas as atividades, checklist, documentos e histórico relacionados. Esta ação não pode ser desfeita.`)) {
      deleteMutation.mutate(id)
    }
  }

  const { data: equipes = [] } = useQuery<Equipe[]>({
    queryKey: ['equipes'],
    queryFn: () => api.get('/api/equipes').then(r => r.data),
  })

  const { data: painel } = useQuery({
    queryKey: ['demandas-painel'],
    queryFn: () => api.get('/api/demandas/painel/resumo').then(r => r.data as {
      totalDemandas: number
      totalAtivas: number
      totalAtrasadas: number
      percentualAtrasadas: number
      minhasAtividadesPendentes: number
      aguardandoMinhaAprovacao: number
      porStatus: Record<string, number>
      porPrioridade: Record<Prioridade, number>
      concluidasEsteMes: number
      concluidasMesAnterior: number
      tempoMedioConclusaoDias: number | null
      taxaDevolucao: number
      atrasadasNaMinhaEquipe: number
      alertaCruzadoPrazo: number
      atividadesAtrasadasTodasEquipes: number
    }),
    refetchInterval: 60_000,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demandas</h1>
          <p className="text-gray-500 text-sm">Processos de regularização por GEP</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => baixarRelatorio('pdf')} className="btn-secondary text-xs">
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={() => baixarRelatorio('excel')} className="btn-secondary text-xs">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
          {isMaster && (
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Nova Demanda
            </button>
          )}
        </div>
      </div>

      {painel && (
        <div className={`grid grid-cols-2 ${isMaster ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3 mb-4`}>
          <div className="card py-3">
            <p className="text-xs text-gray-500 flex items-center gap-1"><FileStack className="w-3.5 h-3.5" /> Total de demandas</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{painel.totalDemandas}</p>
          </div>
          <div className="card py-3">
            <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Atrasadas na minha equipe</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{painel.atrasadasNaMinhaEquipe}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">por prazo da atividade</p>
          </div>
          {isMaster && (
            <button
              onClick={() => {
                setSomenteAtrasadas(false)
                setFiltroStatus('')
                setSomenteAtividadesAtrasadas(v => !v)
              }}
              className={`card py-3 text-left hover:shadow-md transition-shadow ${somenteAtividadesAtrasadas ? 'ring-2 ring-red-400' : ''}`}
            >
              <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Atividades atrasadas (todas as equipes)</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{painel.atividadesAtrasadasTodasEquipes}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">clique para ver as demandas</p>
            </button>
          )}
          <div className="card py-3">
            <p className="text-xs text-blue-600 flex items-center gap-1"><Inbox className="w-3.5 h-3.5" /> Minhas atividades pendentes</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{painel.minhasAtividadesPendentes}</p>
          </div>
          <div className="card py-3">
            <p className="text-xs text-amber-600 flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" /> Aguardando minha aprovação</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{painel.aguardandoMinhaAprovacao}</p>
          </div>
        </div>
      )}

      {painel && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Indicadores estratégicos</h2>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="card py-3">
              <p className="text-xs text-gray-500 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> Taxa de atraso</p>
              <p className={`text-2xl font-bold mt-1 ${painel.percentualAtrasadas > 20 ? 'text-red-600' : painel.percentualAtrasadas > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {painel.percentualAtrasadas}%
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{painel.totalAtrasadas} de {painel.totalAtivas} em curso</p>
            </div>

            <div className="card py-3">
              <p className="text-xs text-gray-500 flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> Tempo médio de conclusão</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                {painel.tempoMedioConclusaoDias !== null ? `${painel.tempoMedioConclusaoDias}d` : '—'}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">do cadastro à conclusão</p>
            </div>

            <div className="card py-3">
              <p className="text-xs text-gray-500 flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Taxa de devolução</p>
              <p className={`text-2xl font-bold mt-1 ${painel.taxaDevolucao > 25 ? 'text-red-600' : painel.taxaDevolucao > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {painel.taxaDevolucao}%
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">atividades já devolvidas</p>
            </div>

            <div className="card py-3">
              <p className="text-xs text-gray-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Concluídas este mês</p>
              <p className="text-2xl font-bold text-gray-800 mt-1 flex items-center gap-1.5">
                {painel.concluidasEsteMes}
                {painel.concluidasMesAnterior > 0 && (
                  painel.concluidasEsteMes >= painel.concluidasMesAnterior ? (
                    <span className="text-xs text-emerald-600 flex items-center font-medium"><TrendingUp className="w-3.5 h-3.5" /></span>
                  ) : (
                    <span className="text-xs text-red-500 flex items-center font-medium"><TrendingDown className="w-3.5 h-3.5" /></span>
                  )
                )}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">mês anterior: {painel.concluidasMesAnterior}</p>
            </div>

            <button onClick={() => { setSomenteAtrasadas(false); setSomenteAtividadesAtrasadas(false); setFiltroStatus('PARCIALMENTE_CONCLUIDA') }} className="card py-3 text-left hover:shadow-md transition-shadow">
              <p className="text-xs text-indigo-600 flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" /> Parcialmente concluídas</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{painel.porStatus.PARCIALMENTE_CONCLUIDA || 0}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">aguardando as demais etapas</p>
            </button>

            <div className="card py-3">
              <p className="text-xs text-gray-500 mb-1.5">Prioridade (demandas em curso)</p>
              <div className="flex items-end gap-1.5 h-8">
                {(['ALTA', 'MEDIA', 'BAIXA'] as Prioridade[]).map(p => {
                  const max = Math.max(1, painel.porPrioridade.ALTA, painel.porPrioridade.MEDIA, painel.porPrioridade.BAIXA)
                  const alturaPercent = (painel.porPrioridade[p] / max) * 100
                  return (
                    <div key={p} className="flex-1 flex flex-col items-center justify-end h-full" title={`${PRIORIDADE_LABEL[p]}: ${painel.porPrioridade[p]}`}>
                      <span className="text-[10px] font-semibold text-gray-600">{painel.porPrioridade[p]}</span>
                      <div className={`w-full rounded-t ${p === 'ALTA' ? 'bg-red-400' : p === 'MEDIA' ? 'bg-amber-400' : 'bg-gray-300'}`} style={{ height: `${Math.max(alturaPercent, 8)}%` }} />
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-1.5 mt-1">
                {(['ALTA', 'MEDIA', 'BAIXA'] as Prioridade[]).map(p => (
                  <span key={p} className="flex-1 text-center text-[9px] text-gray-400">{PRIORIDADE_LABEL[p]}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-4 py-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por GEP, assunto, descrição ou interessado..."
              value={gepBusca}
              onChange={e => setGepBusca(e.target.value)}
            />
          </div>
          <select className="input sm:w-44" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input sm:w-36" value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}>
            <option value="">Toda prioridade</option>
            {Object.entries(PRIORIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button
            onClick={() => { setSomenteAtividadesAtrasadas(false); setSomenteAtrasadas(v => !v) }}
            className={`text-xs px-3 py-2 rounded-lg border flex items-center gap-1.5 whitespace-nowrap ${somenteAtrasadas ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 text-gray-500'}`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Só atrasadas
          </button>
          {somenteAtividadesAtrasadas && (
            <button
              onClick={() => setSomenteAtividadesAtrasadas(false)}
              className="text-xs px-3 py-2 rounded-lg border bg-red-50 border-red-300 text-red-700 flex items-center gap-1.5 whitespace-nowrap"
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Atividades atrasadas <X className="w-3 h-3" />
            </button>
          )}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
            <button onClick={() => setVisualizacao('lista')} className={`px-2.5 py-2 ${visualizacao === 'lista' ? 'bg-primary-50 text-primary-700' : 'text-gray-400'}`} title="Lista">
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setVisualizacao('kanban')} className={`px-2.5 py-2 border-l border-gray-200 ${visualizacao === 'kanban' ? 'bg-primary-50 text-primary-700' : 'text-gray-400'}`} title="Kanban">
              <Columns3 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {visualizacao === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {(Object.keys(STATUS_LABEL) as StatusDemanda[]).map(status => {
            const itens = demandas.filter(d => statusPercebido(d, isMaster, user?.id, equipes) === status)
            return (
              <div key={status} className="flex-shrink-0 w-64 bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-700">{STATUS_LABEL[status]}</h3>
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{itens.length}</span>
                </div>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {itens.map(d => {
                    const atrasada = d.prazo && new Date(d.prazo) < new Date() && !['CONCLUIDA', 'CANCELADA'].includes(d.status)
                    return (
                      <div key={d.id} className={`relative group bg-white rounded-lg border shadow-sm hover:shadow transition-shadow ${atrasada ? 'border-red-300' : 'border-gray-200'}`}>
                        <Link href={`/demandas/${d.id}`} className="block p-3">
                          <div className="flex items-center justify-between gap-2 pr-4">
                            <p className="font-mono text-xs font-semibold text-primary-700">{d.gepNumero}/{d.gepAno}</p>
                            <BadgePrioridade prioridade={d.prioridade} />
                          </div>
                          <p className="text-xs text-gray-700 mt-1 line-clamp-2">{d.assunto}</p>
                          {d.interessado && <p className="text-[10px] text-gray-400 mt-0.5">{d.interessado}</p>}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-gray-400">{d.atividades?.length || 0} atividade(s)</span>
                            {atrasada && <span className="text-[10px] text-red-600 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> atrasada</span>}
                          </div>
                        </Link>
                        {isMaster && (
                          <button
                            onClick={e => { e.preventDefault(); handleDelete(d.id, `${d.gepNumero}/${d.gepAno}`) }}
                            className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Excluir demanda"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {itens.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Vazio</p>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : demandas.length === 0 ? (
          <div className="p-8 text-center">
            <FileStack className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma demanda cadastrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[110px]" /><col /><col className="w-[160px]" />
                <col className="w-[90px]" />
                <col className="w-[110px]" /><col className="w-[130px]" /><col className="w-[110px]" />
                {isMaster && <col className="w-[50px]" />}
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">GEP</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Assunto</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Interessado</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Prioridade</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Atividades</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Criada em</th>
                  {isMaster && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {demandas.map(d => {
                  const statusExibido = statusPercebido(d, isMaster, user?.id, equipes)
                  return (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 align-top">
                      <Link href={`/demandas/${d.id}`} className="font-mono text-xs font-semibold text-primary-700 hover:underline">
                        {d.gepNumero}/{d.gepAno}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-xs break-words align-top">
                      <Link href={`/demandas/${d.id}`} className="hover:underline">{d.assunto}</Link>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs break-words align-top">{d.interessado || '—'}</td>
                    <td className="px-3 py-2 align-top"><BadgePrioridade prioridade={d.prioridade} /></td>
                    <td className="px-3 py-2 align-top">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[statusExibido]}`}>
                        {STATUS_LABEL[statusExibido]}
                      </span>
                      {d.prazo && new Date(d.prazo) < new Date() && !['CONCLUIDA', 'CANCELADA'].includes(d.status) && (
                        <span className="block mt-1 text-[10px] text-red-600 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> Atrasada
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 align-top">{d.atividades?.length || 0}</td>
                    <td className="px-3 py-2 text-xs text-gray-400 align-top">
                      {format(new Date(d.createdAt), 'dd/MM/yy', { locale: ptBR })}
                    </td>
                    {isMaster && (
                      <td className="px-3 py-2 align-top">
                        <button
                          onClick={() => handleDelete(d.id, `${d.gepNumero}/${d.gepAno}`)}
                          className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                          title="Excluir demanda"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Novo Processo GEP</h2>
              <button onClick={fecharModal} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {duplicado && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-2">
                  <p className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {duplicado.mensagem}</p>
                  <div className="flex gap-2">
                    <button onClick={() => router.push(`/demandas/${duplicado.demandaExistenteId}`)} className="btn-secondary text-xs py-1">
                      Abrir demanda existente
                    </button>
                    <button onClick={() => createMutation.mutate(true)} className="btn-primary text-xs py-1">
                      Criar mesmo assim
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Número do GEP *</label>
                  <input className="input" placeholder="126158" value={gepNumero} onChange={e => { setGepNumero(e.target.value); setDuplicado(null) }} autoFocus />
                </div>
                <div>
                  <label className="label">Ano *</label>
                  <input className="input" placeholder="2025" value={gepAno} onChange={e => { setGepAno(e.target.value); setDuplicado(null) }} />
                </div>
              </div>
              <div>
                <label className="label">Assunto *</label>
                <input className="input" placeholder="Ex: Revalidação de alvará" value={assunto} onChange={e => setAssunto(e.target.value)} />
              </div>
              <div>
                <label className="label">Prioridade *</label>
                <select className="input" value={prioridade} onChange={e => setPrioridade(e.target.value as Prioridade)}>
                  {Object.entries(PRIORIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Interessado / Loteamento</label>
                <input className="input" placeholder="Ex: Vila Elisa" value={interessado} onChange={e => setInteressado(e.target.value)} />
              </div>
              <div>
                <label className="label">Descrição</label>
                <textarea className="input min-h-20 resize-none" value={descricao} onChange={e => setDescricao(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={fecharModal} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button
                onClick={() => gepNumero.trim() && gepAno.trim() && assunto.trim() && createMutation.mutate(undefined)}
                disabled={!gepNumero.trim() || !gepAno.trim() || !assunto.trim() || createMutation.isPending}
                className="btn-primary flex-1 justify-center"
              >
                {createMutation.isPending ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
