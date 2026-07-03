'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Tarefa, Etapa, TarefaCard, Imovel, Passo } from '@/types'
import {
  Plus, Trash2, Building2, X, ArrowRight, ArrowLeft, CheckCircle2,
  ListChecks, ChevronRight, Flag
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

// Passos da etapa em que o card está agora (o restante é histórico)
const passosDaEtapaAtual = (card: TarefaCard) =>
  card.passos.filter(p => (p.etapaId ?? card.etapaId) === card.etapaId)

// Histórico agrupado por etapa anterior, na ordem em que os passos foram criados
const historicoPorEtapa = (card: TarefaCard) => {
  const grupos: { titulo: string; passos: Passo[] }[] = []
  for (const p of card.passos) {
    if ((p.etapaId ?? card.etapaId) === card.etapaId) continue
    const titulo = p.etapaTitulo || 'Etapa anterior'
    const grupo = grupos.find(g => g.titulo === titulo)
    if (grupo) grupo.passos.push(p)
    else grupos.push({ titulo, passos: [p] })
  }
  return grupos
}

export default function TarefasPage() {
  const qc = useQueryClient()
  const { isMaster } = useAuth()

  // Criação de tarefa
  const [showNovaTarefa, setShowNovaTarefa] = useState(false)
  const [novaTarefaTitulo, setNovaTarefaTitulo] = useState('')

  // Criação de etapa (por tarefa)
  const [addEtapaTarefa, setAddEtapaTarefa] = useState<string | null>(null)
  const [novaEtapaTitulo, setNovaEtapaTitulo] = useState('')

  // Adição de imóvel (por etapa)
  const [addCardEtapa, setAddCardEtapa] = useState<string | null>(null)
  const [addCardImovelId, setAddCardImovelId] = useState('')

  // Modal do card (checklist de passos)
  const [cardAberto, setCardAberto] = useState<string | null>(null)
  const [novoPasso, setNovoPasso] = useState('')

  const { data: tarefas = [] } = useQuery<Tarefa[]>({
    queryKey: ['tarefas'],
    queryFn: () => api.get('/api/tarefas').then(r => r.data)
  })

  const { data: imoveis = [] } = useQuery<Imovel[]>({
    queryKey: ['imoveis'],
    queryFn: () => api.get('/api/imoveis').then(r => r.data)
  })

  const imoveisOrdenados = [...imoveis].sort((a, b) =>
    a.inscricaoImobiliaria.localeCompare(b.inscricaoImobiliaria, 'pt-BR', { numeric: true })
  )

  const invalidar = () => qc.invalidateQueries({ queryKey: ['tarefas'] })

  // ===== Mutations =====

  const createTarefa = useMutation({
    mutationFn: () => api.post('/api/tarefas', { titulo: novaTarefaTitulo }),
    onSuccess: () => { invalidar(); setNovaTarefaTitulo(''); setShowNovaTarefa(false); toast.success('Tarefa criada') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao criar tarefa'))
  })

  const deleteTarefa = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tarefas/${id}`),
    onSuccess: () => { invalidar(); toast.success('Tarefa removida') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover tarefa'))
  })

  const createEtapa = useMutation({
    mutationFn: ({ tarefaId }: { tarefaId: string }) =>
      api.post(`/api/tarefas/${tarefaId}/etapas`, { titulo: novaEtapaTitulo }),
    onSuccess: () => { invalidar(); setNovaEtapaTitulo(''); setAddEtapaTarefa(null); toast.success('Etapa adicionada') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao criar etapa'))
  })

  const deleteEtapa = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tarefas/etapas/${id}`),
    onSuccess: () => { invalidar(); toast.success('Etapa removida') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover etapa'))
  })

  const addCard = useMutation({
    mutationFn: ({ etapaId }: { etapaId: string }) =>
      api.post(`/api/tarefas/etapas/${etapaId}/cards`, { imovelId: addCardImovelId }),
    onSuccess: () => { invalidar(); setAddCardEtapa(null); setAddCardImovelId(''); toast.success('Imóvel adicionado') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao adicionar imóvel'))
  })

  const deleteCard = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tarefas/cards/${id}`),
    onSuccess: () => { invalidar(); setCardAberto(null); toast.success('Imóvel removido da tarefa') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover'))
  })

  const avancarCard = useMutation({
    mutationFn: (id: string) => api.put(`/api/tarefas/cards/${id}/avancar`),
    onSuccess: () => { invalidar(); toast.success('Imóvel avançou para a próxima etapa!') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao avançar'))
  })

  const retornarCard = useMutation({
    mutationFn: (id: string) => api.put(`/api/tarefas/cards/${id}/retornar`),
    onSuccess: () => { invalidar(); toast.success('Imóvel retornou para a etapa anterior') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao retornar'))
  })

  const addPasso = useMutation({
    mutationFn: (cardId: string) => api.post(`/api/tarefas/cards/${cardId}/passos`, { descricao: novoPasso }),
    onSuccess: () => { invalidar(); setNovoPasso('') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao adicionar passo'))
  })

  const togglePasso = useMutation({
    mutationFn: ({ id, concluido }: { id: string; concluido: boolean }) =>
      api.put(`/api/tarefas/passos/${id}`, { concluido }),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao atualizar passo'))
  })

  const deletePasso = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tarefas/passos/${id}`),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover passo'))
  })

  // Localiza o card aberto (dados sempre atualizados do cache)
  const cardModal: { card: TarefaCard; etapa: Etapa; tarefa: Tarefa; isUltima: boolean; isPrimeira: boolean } | null = (() => {
    if (!cardAberto) return null
    for (const t of tarefas) {
      for (const e of t.etapas) {
        const c = e.cards.find(c => c.id === cardAberto)
        if (c) {
          const idx = t.etapas.findIndex(et => et.id === e.id)
          return { card: c, etapa: e, tarefa: t, isUltima: idx === t.etapas.length - 1, isPrimeira: idx === 0 }
        }
      }
    }
    return null
  })()

  const passosAtuais = cardModal ? passosDaEtapaAtual(cardModal.card) : []
  const historico = cardModal ? historicoPorEtapa(cardModal.card) : []
  const todosConcluidos = passosAtuais.length > 0 && passosAtuais.every(p => p.concluido)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarefas</h1>
          <p className="text-gray-500 text-sm">Fluxo de processos dos imóveis por etapas</p>
        </div>
        <button onClick={() => setShowNovaTarefa(true)} className="btn-primary text-xs">
          <Plus className="w-3.5 h-3.5" /> Nova Tarefa
        </button>
      </div>

      {/* Formulário nova tarefa */}
      {showNovaTarefa && (
        <div className="card mb-4 py-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              className="input flex-1"
              placeholder="Nome da tarefa (ex: Escritura Pública)..."
              value={novaTarefaTitulo}
              onChange={e => setNovaTarefaTitulo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && novaTarefaTitulo.trim() && createTarefa.mutate()}
            />
            <button
              onClick={() => novaTarefaTitulo.trim() && createTarefa.mutate()}
              disabled={!novaTarefaTitulo.trim() || createTarefa.isPending}
              className="btn-primary text-xs"
            >
              Criar
            </button>
            <button onClick={() => { setShowNovaTarefa(false); setNovaTarefaTitulo('') }} className="btn-secondary text-xs">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Linhas de tarefas (fluxograma) */}
      <div className="space-y-5">
        {tarefas.map(tarefa => (
          <div key={tarefa.id} className="card p-4">
            {/* Cabeçalho da linha */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-primary-600" />
                <h2 className="font-bold text-gray-800">{tarefa.titulo}</h2>
                <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                  {tarefa.etapas.reduce((acc, e) => acc + e.cards.length, 0)} imóvel(is)
                </span>
              </div>
              {isMaster && (
                <button
                  onClick={() => confirm(`Excluir a tarefa "${tarefa.titulo}" e todas as suas etapas?`) && deleteTarefa.mutate(tarefa.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Etapas em fluxo horizontal */}
            <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
              {tarefa.etapas.map((etapa, idx) => (
                <div key={etapa.id} className="flex items-stretch gap-1 flex-shrink-0">
                  {idx > 0 && (
                    <div className="flex items-center px-0.5">
                      <ArrowRight className="w-4 h-4 text-gray-300" />
                    </div>
                  )}
                  <div className="w-56 bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="flex-shrink-0 w-5 h-5 bg-primary-100 text-primary-700 text-xs font-bold rounded-full flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <h3 className="font-semibold text-xs text-gray-700 truncate">{etapa.titulo}</h3>
                      </div>
                      {isMaster && (
                        <button
                          onClick={() => confirm(`Excluir a etapa "${etapa.titulo}"?`) && deleteEtapa.mutate(etapa.id)}
                          className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Cards da etapa */}
                    <div className="space-y-1.5 flex-1">
                      {etapa.cards.map(card => {
                        const atuais = passosDaEtapaAtual(card)
                        const done = atuais.filter(p => p.concluido).length
                        const total = atuais.length
                        const completo = total > 0 && done === total
                        return (
                          <button
                            key={card.id}
                            onClick={() => setCardAberto(card.id)}
                            className={`w-full text-left bg-white border rounded-lg p-2 shadow-sm hover:shadow transition-all ${
                              completo ? 'border-green-300' : 'border-gray-200 hover:border-primary-300'
                            }`}
                          >
                            <p className="text-[11px] font-mono font-semibold text-primary-700 truncate">
                              {card.imovel.inscricaoImobiliaria}
                            </p>
                            <p className="text-[10px] text-gray-500 truncate">{card.imovel.logradouro}</p>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              {total > 0 ? (
                                <>
                                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${completo ? 'bg-green-500' : 'bg-primary-500'}`}
                                      style={{ width: `${(done / total) * 100}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] font-medium ${completo ? 'text-green-600' : 'text-gray-400'}`}>
                                    {done}/{total}
                                  </span>
                                  {completo && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                                </>
                              ) : (
                                <span className="text-[10px] text-gray-300 flex items-center gap-1">
                                  <ListChecks className="w-3 h-3" /> sem passos
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Adicionar imóvel (somente na primeira etapa) */}
                    {idx === 0 && (
                      addCardEtapa === etapa.id ? (
                        <div className="mt-2">
                          <select
                            autoFocus
                            className="input text-xs mb-1.5"
                            value={addCardImovelId}
                            onChange={e => setAddCardImovelId(e.target.value)}
                          >
                            <option value="">Selecione o imóvel...</option>
                            {imoveisOrdenados.map(im => (
                              <option key={im.id} value={im.id}>
                                {im.inscricaoImobiliaria} — {im.logradouro}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => addCardImovelId && addCard.mutate({ etapaId: etapa.id })}
                              disabled={!addCardImovelId || addCard.isPending}
                              className="btn-primary text-[11px] flex-1 justify-center py-1"
                            >
                              Adicionar
                            </button>
                            <button
                              onClick={() => { setAddCardEtapa(null); setAddCardImovelId('') }}
                              className="btn-secondary text-[11px] py-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddCardEtapa(etapa.id); setAddCardImovelId('') }}
                          className="mt-2 w-full py-1.5 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Imóvel
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}

              {/* Adicionar etapa ao fim da linha */}
              <div className="flex items-stretch gap-1 flex-shrink-0">
                {tarefa.etapas.length > 0 && (
                  <div className="flex items-center px-0.5">
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                  </div>
                )}
                {addEtapaTarefa === tarefa.id ? (
                  <div className="w-56 bg-gray-50 border-2 border-dashed border-primary-200 rounded-xl p-3">
                    <input
                      autoFocus
                      className="input text-xs mb-1.5"
                      placeholder="Nome da etapa..."
                      value={novaEtapaTitulo}
                      onChange={e => setNovaEtapaTitulo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && novaEtapaTitulo.trim() && createEtapa.mutate({ tarefaId: tarefa.id })}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => novaEtapaTitulo.trim() && createEtapa.mutate({ tarefaId: tarefa.id })}
                        disabled={!novaEtapaTitulo.trim() || createEtapa.isPending}
                        className="btn-primary text-[11px] flex-1 justify-center py-1"
                      >
                        Criar
                      </button>
                      <button
                        onClick={() => { setAddEtapaTarefa(null); setNovaEtapaTitulo('') }}
                        className="btn-secondary text-[11px] py-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddEtapaTarefa(tarefa.id); setNovaEtapaTitulo('') }}
                    className="w-32 min-h-20 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-primary-600 hover:border-primary-300 transition-colors flex flex-col items-center justify-center gap-1 text-xs"
                  >
                    <Plus className="w-4 h-4" /> Etapa
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {tarefas.length === 0 && !showNovaTarefa && (
          <div className="flex items-center justify-center min-h-64 border-2 border-dashed border-gray-200 rounded-xl">
            <div className="text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-3">Crie sua primeira tarefa e adicione as etapas do processo</p>
              <button onClick={() => setShowNovaTarefa(true)} className="btn-primary text-xs">
                <Plus className="w-3.5 h-3.5" /> Nova Tarefa
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal do card: checklist de passos */}
      {cardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold text-primary-700">{cardModal.card.imovel.inscricaoImobiliaria}</p>
                <p className="text-xs text-gray-500 truncate">{cardModal.card.imovel.logradouro}, {cardModal.card.imovel.bairro}</p>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 flex-wrap">
                  <span className="font-medium text-gray-700">{cardModal.tarefa.titulo}</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                    Etapa {cardModal.tarefa.etapas.findIndex(e => e.id === cardModal.etapa.id) + 1}: {cardModal.etapa.titulo}
                  </span>
                </div>
              </div>
              <button onClick={() => { setCardAberto(null); setNovoPasso('') }} className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-primary-600" /> Passos desta etapa
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                Adicione os passos necessários e marque conforme concluir. Todos marcados liberam o avanço.
              </p>

              {/* Adicionar passo */}
              <div className="flex gap-2 mb-4">
                <input
                  className="input text-sm flex-1"
                  placeholder="Descrever novo passo..."
                  value={novoPasso}
                  onChange={e => setNovoPasso(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && novoPasso.trim() && addPasso.mutate(cardModal.card.id)}
                />
                <button
                  onClick={() => novoPasso.trim() && addPasso.mutate(cardModal.card.id)}
                  disabled={!novoPasso.trim() || addPasso.isPending}
                  className="btn-primary text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Lista de passos da etapa atual */}
              {passosAtuais.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">Nenhum passo cadastrado nesta etapa</p>
              ) : (
                <div className="space-y-1.5">
                  {passosAtuais.map(passo => (
                    <div
                      key={passo.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border group transition-colors ${
                        passo.concluido ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={passo.concluido}
                        onChange={e => togglePasso.mutate({ id: passo.id, concluido: e.target.checked })}
                        className="w-4 h-4 accent-green-600 cursor-pointer flex-shrink-0"
                      />
                      <span className={`flex-1 text-sm ${passo.concluido ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {passo.descricao}
                      </span>
                      <button
                        onClick={() => deletePasso.mutate(passo.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 rounded transition-all flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Histórico das etapas anteriores (somente leitura) */}
              {historico.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" /> Histórico de etapas anteriores
                  </h4>
                  <div className="space-y-3">
                    {historico.map(grupo => (
                      <div key={grupo.titulo} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-600 mb-1.5">{grupo.titulo}</p>
                        <div className="space-y-1">
                          {grupo.passos.map(p => (
                            <div key={p.id} className="flex items-center gap-2 text-xs text-gray-400">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                              <span className="line-through">{p.descricao}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-100 space-y-2">
              {cardModal.isUltima ? (
                todosConcluidos ? (
                  <p className="text-center text-sm text-green-600 font-medium flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Processo concluído — este imóvel está na última etapa!
                  </p>
                ) : (
                  <p className="text-center text-xs text-gray-400">Esta é a última etapa do processo</p>
                )
              ) : (
                <button
                  onClick={() => avancarCard.mutate(cardModal.card.id)}
                  disabled={!todosConcluidos || avancarCard.isPending}
                  className="btn-primary w-full justify-center"
                  title={!todosConcluidos ? 'Conclua todos os passos para avançar' : ''}
                >
                  <ArrowRight className="w-4 h-4" />
                  {avancarCard.isPending ? 'Avançando...' : 'Avançar para próxima etapa'}
                </button>
              )}
              {!todosConcluidos && !cardModal.isUltima && passosAtuais.length > 0 && (
                <p className="text-center text-xs text-amber-600">
                  {passosAtuais.filter(p => !p.concluido).length} passo(s) pendente(s) para liberar o avanço
                </p>
              )}
              {!cardModal.isPrimeira && (
                <button
                  onClick={() => confirm(`Retornar o imóvel para a etapa anterior? Os passos daquela etapa voltarão a ser editáveis.`) && retornarCard.mutate(cardModal.card.id)}
                  disabled={retornarCard.isPending}
                  className="btn-secondary w-full justify-center text-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {retornarCard.isPending ? 'Retornando...' : 'Retornar à etapa anterior'}
                </button>
              )}
              <button
                onClick={() => confirm('Remover este imóvel da tarefa?') && deleteCard.mutate(cardModal.card.id)}
                className="w-full text-center text-xs text-gray-400 hover:text-red-500 transition-colors py-1"
              >
                Remover imóvel desta tarefa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
