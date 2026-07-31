'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Demanda, Atividade, StatusAtividade, User } from '@/types'
import Link from 'next/link'
import { ArrowLeft, Plus, X, CheckCircle2, ListChecks, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/hooks/useAuth'

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

const STATUS_ATIV_LABEL: Record<StatusAtividade, string> = {
  ATRIBUIDA: 'Atribuída',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída (aguardando aprovação)',
  DEVOLVIDA: 'Devolvida para correção',
  APROVADA: 'Aprovada',
  CANCELADA: 'Cancelada',
}

const STATUS_ATIV_COLOR: Record<StatusAtividade, string> = {
  ATRIBUIDA: 'bg-gray-100 text-gray-600',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  CONCLUIDA: 'bg-amber-100 text-amber-700',
  DEVOLVIDA: 'bg-orange-100 text-orange-700',
  APROVADA: 'bg-green-100 text-green-700',
  CANCELADA: 'bg-red-100 text-red-700',
}

export default function DemandaDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const qc = useQueryClient()
  const { user, isMaster } = useAuth()

  const [showNovaAtividade, setShowNovaAtividade] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoResponsavel, setNovoResponsavel] = useState('')
  const [novasInstrucoes, setNovasInstrucoes] = useState('')

  const [atividadeAberta, setAtividadeAberta] = useState<string | null>(null)
  const [novoPasso, setNovoPasso] = useState('')
  const [devolverMotivo, setDevolverMotivo] = useState('')
  const [showDevolver, setShowDevolver] = useState(false)

  const { data: demanda, isLoading } = useQuery<Demanda>({
    queryKey: ['demanda', id],
    queryFn: () => api.get(`/api/demandas/${id}`).then(r => r.data),
  })

  const { data: usuarios = [] } = useQuery<User[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/api/usuarios').then(r => r.data),
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['demanda', id] })

  const createAtividade = useMutation({
    mutationFn: () => api.post(`/api/demandas/${id}/atividades`, { titulo: novoTitulo, responsavelId: novoResponsavel, instrucoes: novasInstrucoes }),
    onSuccess: () => {
      invalidar(); toast.success('Atividade atribuída')
      setShowNovaAtividade(false); setNovoTitulo(''); setNovoResponsavel(''); setNovasInstrucoes('')
    },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao criar atividade'))
  })

  const statusAtividade = useMutation({
    mutationFn: ({ atividadeId, status, motivo }: { atividadeId: string; status: string; motivo?: string }) =>
      api.put(`/api/demandas/atividades/${atividadeId}/status`, { status, motivo }),
    onSuccess: () => { invalidar(); toast.success('Atividade atualizada'); setShowDevolver(false); setDevolverMotivo('') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao atualizar atividade'))
  })

  const addPasso = useMutation({
    mutationFn: (atividadeId: string) => api.post(`/api/demandas/atividades/${atividadeId}/passos`, { descricao: novoPasso }),
    onSuccess: () => { invalidar(); setNovoPasso('') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao adicionar passo'))
  })

  const togglePasso = useMutation({
    mutationFn: ({ id, concluido }: { id: string; concluido: boolean }) => api.put(`/api/demandas/passos/${id}`, { concluido }),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao atualizar passo'))
  })

  if (isLoading) return <div className="p-8 text-center text-gray-400">Carregando...</div>
  if (!demanda) return <div className="p-8 text-center text-gray-400">Demanda não encontrada</div>

  const atividadeModal = demanda.atividades.find(a => a.id === atividadeAberta) || null
  const isResponsavel = (a: Atividade) => a.responsavel.id === user?.id
  const isSolicitante = (a: Atividade) => a.solicitante.id === user?.id
  const podeGerenciarChecklist = (a: Atividade) => isMaster || isResponsavel(a) || isSolicitante(a)

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/demandas" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-mono">GEP {demanda.gepNumero}/{demanda.gepAno}</h1>
          <p className="text-gray-500 text-sm">{demanda.assunto}{demanda.interessado ? ` — ${demanda.interessado}` : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Atividades</h2>
            {(isMaster || demanda.solicitante.id === user?.id) && (
              <button onClick={() => setShowNovaAtividade(true)} className="btn-primary text-xs">
                <Plus className="w-3.5 h-3.5" /> Nova Atividade
              </button>
            )}
          </div>

          {showNovaAtividade && (
            <div className="card space-y-3">
              <div>
                <label className="label">Título da atividade</label>
                <input className="input" placeholder="Ex: Elaborar parecer jurídico" value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Responsável</label>
                <select className="input" value={novoResponsavel} onChange={e => setNovoResponsavel(e.target.value)}>
                  <option value="">Selecione...</option>
                  {usuarios.filter(u => u.active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Instruções</label>
                <textarea className="input min-h-16 resize-none" value={novasInstrucoes} onChange={e => setNovasInstrucoes(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowNovaAtividade(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
                <button
                  onClick={() => novoTitulo.trim() && novoResponsavel && createAtividade.mutate()}
                  disabled={!novoTitulo.trim() || !novoResponsavel || createAtividade.isPending}
                  className="btn-primary flex-1 justify-center text-xs"
                >
                  Atribuir
                </button>
              </div>
            </div>
          )}

          {demanda.atividades.length === 0 && !showNovaAtividade && (
            <div className="card text-center py-8 text-gray-400">Nenhuma atividade criada ainda</div>
          )}

          {demanda.atividades.map(a => {
            const done = a.passos.filter(p => p.concluido).length
            const total = a.passos.length
            return (
              <button key={a.id} onClick={() => setAtividadeAberta(a.id)} className="card w-full text-left hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{a.titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Responsável: {a.responsavel.name}</p>
                    {total > 0 && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <ListChecks className="w-3 h-3" /> {done}/{total} passos concluídos
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_ATIV_COLOR[a.status]}`}>
                    {STATUS_ATIV_LABEL[a.status]}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-sm text-gray-800 mb-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary-600" /> Linha do tempo
            </h3>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {(demanda.historico || []).map(h => (
                <div key={h.id} className="border-l-2 border-primary-100 pl-3 py-0.5">
                  <p className="text-xs text-gray-700">{h.descricao}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {format(new Date(h.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </p>
                </div>
              ))}
              {(!demanda.historico || demanda.historico.length === 0) && (
                <p className="text-xs text-gray-400 text-center py-4">Sem eventos registrados</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal atividade */}
      {atividadeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-800">{atividadeModal.titulo}</p>
                <p className="text-xs text-gray-500 mt-0.5">Responsável: {atividadeModal.responsavel.name} · Solicitante: {atividadeModal.solicitante.name}</p>
                <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_ATIV_COLOR[atividadeModal.status]}`}>
                  {STATUS_ATIV_LABEL[atividadeModal.status]}
                </span>
              </div>
              <button onClick={() => { setAtividadeAberta(null); setShowDevolver(false) }} className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {atividadeModal.instrucoes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Instruções</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{atividadeModal.instrucoes}</p>
                </div>
              )}

              {atividadeModal.motivoDevolucao && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-orange-700 mb-1">Motivo da última devolução</p>
                  <p className="text-sm text-orange-800">{atividadeModal.motivoDevolucao}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" /> Checklist
                </p>
                {podeGerenciarChecklist(atividadeModal) && (
                  <div className="flex gap-2 mb-2">
                    <input
                      className="input text-sm flex-1"
                      placeholder="Adicionar item ao checklist..."
                      value={novoPasso}
                      onChange={e => setNovoPasso(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && novoPasso.trim() && addPasso.mutate(atividadeModal.id)}
                    />
                    <button
                      onClick={() => novoPasso.trim() && addPasso.mutate(atividadeModal.id)}
                      disabled={!novoPasso.trim()}
                      className="btn-primary text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {atividadeModal.passos.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Nenhum item no checklist</p>
                ) : (
                  <div className="space-y-1.5">
                    {atividadeModal.passos.map(p => (
                      <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${p.concluido ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'} ${!podeGerenciarChecklist(atividadeModal) ? 'opacity-70' : ''}`}>
                        <input
                          type="checkbox"
                          checked={p.concluido}
                          disabled={!podeGerenciarChecklist(atividadeModal)}
                          onChange={e => togglePasso.mutate({ id: p.id, concluido: e.target.checked })}
                          className="w-4 h-4 accent-green-600"
                        />
                        <span className={p.concluido ? 'text-gray-400 line-through' : 'text-gray-700'}>{p.descricao}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 space-y-2">
              {atividadeModal.status === 'ATRIBUIDA' && isResponsavel(atividadeModal) && (
                <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'EM_ANDAMENTO' })} className="btn-primary w-full justify-center">
                  Iniciar atividade
                </button>
              )}
              {atividadeModal.status === 'EM_ANDAMENTO' && isResponsavel(atividadeModal) && (
                <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'CONCLUIDA' })} className="btn-primary w-full justify-center">
                  <CheckCircle2 className="w-4 h-4" /> Concluir e devolver ao solicitante
                </button>
              )}
              {atividadeModal.status === 'CONCLUIDA' && isSolicitante(atividadeModal) && !showDevolver && (
                <div className="flex gap-2">
                  <button onClick={() => setShowDevolver(true)} className="btn-secondary flex-1 justify-center">Devolver para correção</button>
                  <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'APROVADA' })} className="btn-primary flex-1 justify-center">
                    Aprovar
                  </button>
                </div>
              )}
              {showDevolver && (
                <div className="space-y-2">
                  <textarea
                    className="input text-sm min-h-16 resize-none"
                    placeholder="Motivo da devolução (obrigatório)..."
                    value={devolverMotivo}
                    onChange={e => setDevolverMotivo(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowDevolver(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
                    <button
                      onClick={() => devolverMotivo.trim() && statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'DEVOLVIDA', motivo: devolverMotivo.trim() })}
                      disabled={!devolverMotivo.trim()}
                      className="btn-primary flex-1 justify-center text-xs"
                    >
                      Confirmar devolução
                    </button>
                  </div>
                </div>
              )}
              {atividadeModal.status === 'APROVADA' && (
                <p className="text-center text-sm text-green-600 font-medium flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Atividade aprovada
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
