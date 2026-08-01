'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TipoDemanda, Equipe } from '@/types'
import { Plus, X, Trash2, Workflow, ArrowRight, GitBranch } from 'lucide-react'
import toast from 'react-hot-toast'

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

// Etapas com o mesmo `ordem` rodam em paralelo — agrupa para exibir lado a lado na mesma "coluna" do fluxo.
function agruparPorOrdem<T extends { ordem: number }>(etapas: T[]): T[][] {
  const porOrdem = new Map<number, T[]>()
  for (const e of etapas) {
    porOrdem.set(e.ordem, [...(porOrdem.get(e.ordem) || []), e])
  }
  return [...porOrdem.entries()].sort(([a], [b]) => a - b).map(([, grupo]) => grupo)
}

export default function TiposDemandaPage() {
  const qc = useQueryClient()
  const [showNovo, setShowNovo] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazoPadraoDias, setPrazoPadraoDias] = useState('')

  const [addEtapaTipo, setAddEtapaTipo] = useState<string | null>(null)
  const [etapaTitulo, setEtapaTitulo] = useState('')
  const [etapaEquipe, setEtapaEquipe] = useState('')
  const [etapaParaleloCom, setEtapaParaleloCom] = useState('')

  const { data: tipos = [] } = useQuery<TipoDemanda[]>({
    queryKey: ['tipos-demanda'],
    queryFn: () => api.get('/api/tipos-demanda').then(r => r.data),
  })

  const { data: equipes = [] } = useQuery<Equipe[]>({
    queryKey: ['equipes'],
    queryFn: () => api.get('/api/equipes').then(r => r.data),
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['tipos-demanda'] })

  const createTipo = useMutation({
    mutationFn: () => api.post('/api/tipos-demanda', { nome, descricao, prazoPadraoDias: prazoPadraoDias || undefined }),
    onSuccess: () => { invalidar(); setShowNovo(false); setNome(''); setDescricao(''); setPrazoPadraoDias(''); toast.success('Tipo de demanda criado') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao criar tipo de demanda'))
  })

  const deleteTipo = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tipos-demanda/${id}`),
    onSuccess: () => { invalidar(); toast.success('Tipo removido') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover tipo'))
  })

  const createEtapa = useMutation({
    mutationFn: (tipoId: string) => api.post(`/api/tipos-demanda/${tipoId}/etapas`, {
      titulo: etapaTitulo, equipeId: etapaEquipe || undefined, paraleloComEtapaId: etapaParaleloCom || undefined,
    }),
    onSuccess: () => {
      invalidar(); setAddEtapaTipo(null); setEtapaTitulo(''); setEtapaEquipe(''); setEtapaParaleloCom('')
      toast.success(etapaParaleloCom ? 'Etapa paralela adicionada' : 'Etapa adicionada ao modelo')
    },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao adicionar etapa'))
  })

  const deleteEtapa = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tipos-demanda/etapas/${id}`),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover etapa'))
  })

  const nomeEquipe = (id?: string) => equipes.find(e => e.id === id)?.nome

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tipos de Demanda</h1>
          <p className="text-gray-500 text-sm">Motor de fluxo: defina etapas padrão que serão criadas automaticamente ao abrir uma demanda deste tipo</p>
        </div>
        <button onClick={() => setShowNovo(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Novo Tipo
        </button>
      </div>

      {showNovo && (
        <div className="card mb-6 space-y-3">
          <div>
            <label className="label">Nome do tipo de demanda</label>
            <input className="input" placeholder="Ex: Revalidação de Alvará" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input" value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>
          <div>
            <label className="label">Prazo padrão (dias)</label>
            <input className="input" type="number" value={prazoPadraoDias} onChange={e => setPrazoPadraoDias(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowNovo(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
            <button onClick={() => nome.trim() && createTipo.mutate()} disabled={!nome.trim()} className="btn-primary flex-1 justify-center text-xs">Criar</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {tipos.map(tipo => (
          <div key={tipo.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-primary-600" />
                <h3 className="font-semibold text-gray-800">{tipo.nome}</h3>
                {tipo.prazoPadraoDias && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{tipo.prazoPadraoDias} dias</span>}
              </div>
              <button onClick={() => confirm(`Excluir o tipo "${tipo.nome}"?`) && deleteTipo.mutate(tipo.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {tipo.descricao && <p className="text-xs text-gray-500 mb-3">{tipo.descricao}</p>}

            <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
              {agruparPorOrdem(tipo.etapasModelo).map((grupo, idx) => (
                <div key={grupo[0].ordem} className="flex items-center gap-1 flex-shrink-0">
                  {idx > 0 && <ArrowRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                  <div className="flex flex-col gap-1.5 justify-center">
                    {grupo.length > 1 && (
                      <p className="text-[10px] text-primary-600 flex items-center gap-1 justify-center">
                        <GitBranch className="w-3 h-3" /> em paralelo
                      </p>
                    )}
                    {grupo.map(etapa => (
                      <div key={etapa.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 min-w-[140px]">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-medium text-gray-700">{etapa.titulo}</p>
                          <button onClick={() => deleteEtapa.mutate(etapa.id)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {etapa.equipeId && <p className="text-[10px] text-gray-400 mt-1">{nomeEquipe(etapa.equipeId)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {addEtapaTipo === tipo.id ? (
                <div className="bg-gray-50 border-2 border-dashed border-primary-200 rounded-lg p-2 min-w-[220px] flex-shrink-0">
                  <input className="input text-xs mb-1.5" placeholder="Título da etapa..." value={etapaTitulo} onChange={e => setEtapaTitulo(e.target.value)} autoFocus />
                  <select className="input text-xs mb-1.5" value={etapaEquipe} onChange={e => setEtapaEquipe(e.target.value)}>
                    <option value="">Sem equipe padrão</option>
                    {equipes.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                  {tipo.etapasModelo.length > 0 && (
                    <select className="input text-xs mb-1.5" value={etapaParaleloCom} onChange={e => setEtapaParaleloCom(e.target.value)}>
                      <option value="">Sequencial (etapa seguinte)</option>
                      {tipo.etapasModelo.map(e => <option key={e.id} value={e.id}>Em paralelo com: {e.titulo}</option>)}
                    </select>
                  )}
                  <div className="flex gap-1.5">
                    <button onClick={() => etapaTitulo.trim() && createEtapa.mutate(tipo.id)} disabled={!etapaTitulo.trim()} className="btn-primary text-[11px] flex-1 justify-center py-1">Criar</button>
                    <button onClick={() => setAddEtapaTipo(null)} className="btn-secondary text-[11px] py-1"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setAddEtapaTipo(tipo.id); setEtapaTitulo(''); setEtapaEquipe(''); setEtapaParaleloCom('') }} className="flex-shrink-0 w-24 h-16 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:text-primary-600 hover:border-primary-300 flex flex-col items-center justify-center gap-1 text-xs">
                  <Plus className="w-4 h-4" /> Etapa
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {tipos.length === 0 && !showNovo && (
        <div className="card text-center py-12 text-gray-400">
          <Workflow className="w-12 h-12 mx-auto mb-3 opacity-30" />
          Nenhum tipo de demanda cadastrado
        </div>
      )}
    </div>
  )
}
