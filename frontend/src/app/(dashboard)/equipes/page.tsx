'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Equipe, User } from '@/types'
import { Plus, X, Trash2, UsersRound, Star } from 'lucide-react'
import toast from 'react-hot-toast'

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

export default function EquipesPage() {
  const qc = useQueryClient()
  const [showNova, setShowNova] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [addMembroEquipe, setAddMembroEquipe] = useState<string | null>(null)
  const [membroSelecionado, setMembroSelecionado] = useState('')

  const { data: equipes = [] } = useQuery<Equipe[]>({
    queryKey: ['equipes'],
    queryFn: () => api.get('/api/equipes').then(r => r.data),
  })

  const { data: usuarios = [] } = useQuery<User[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/api/usuarios').then(r => r.data),
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['equipes'] })

  const createEquipe = useMutation({
    mutationFn: () => api.post('/api/equipes', { nome, descricao }),
    onSuccess: () => { invalidar(); setShowNova(false); setNome(''); setDescricao(''); toast.success('Equipe criada') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao criar equipe'))
  })

  const deleteEquipe = useMutation({
    mutationFn: (id: string) => api.delete(`/api/equipes/${id}`),
    onSuccess: () => { invalidar(); toast.success('Equipe removida') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover equipe'))
  })

  const addMembro = useMutation({
    mutationFn: (equipeId: string) => api.post(`/api/equipes/${equipeId}/membros`, { userId: membroSelecionado }),
    onSuccess: () => { invalidar(); setAddMembroEquipe(null); setMembroSelecionado(''); toast.success('Membro adicionado') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao adicionar membro'))
  })

  const removeMembro = useMutation({
    mutationFn: (membroId: string) => api.delete(`/api/equipes/membros/${membroId}`),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover membro'))
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipes</h1>
          <p className="text-gray-500 text-sm">Grupos de usuários para atribuição de atividades em demandas</p>
        </div>
        <button onClick={() => setShowNova(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Nova Equipe
        </button>
      </div>

      {showNova && (
        <div className="card mb-6 space-y-3">
          <div>
            <label className="label">Nome da equipe</label>
            <input className="input" placeholder="Ex: Engenharia, Parecer Jurídico..." value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input" value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowNova(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
            <button onClick={() => nome.trim() && createEquipe.mutate()} disabled={!nome.trim()} className="btn-primary flex-1 justify-center text-xs">Criar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {equipes.map(equipe => (
          <div key={equipe.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <UsersRound className="w-4 h-4 text-primary-600" />
                <h3 className="font-semibold text-gray-800">{equipe.nome}</h3>
                {!equipe.ativo && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">inativa</span>}
              </div>
              <button onClick={() => confirm(`Excluir a equipe "${equipe.nome}"?`) && deleteEquipe.mutate(equipe.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {equipe.descricao && <p className="text-xs text-gray-500 mb-3">{equipe.descricao}</p>}

            <div className="space-y-1.5 mb-3">
              {equipe.membros.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum membro ainda</p>
              ) : (
                equipe.membros.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                    <span className="flex items-center gap-1.5">
                      {m.principal && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      {m.user.name}
                    </span>
                    <button onClick={() => removeMembro.mutate(m.id)} className="text-gray-300 hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {addMembroEquipe === equipe.id ? (
              <div className="flex gap-2">
                <select className="input text-xs flex-1" value={membroSelecionado} onChange={e => setMembroSelecionado(e.target.value)}>
                  <option value="">Selecione...</option>
                  {usuarios.filter(u => u.active && !equipe.membros.some(m => m.user.id === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button onClick={() => membroSelecionado && addMembro.mutate(equipe.id)} disabled={!membroSelecionado} className="btn-primary text-xs">Add</button>
                <button onClick={() => setAddMembroEquipe(null)} className="btn-secondary text-xs"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button onClick={() => { setAddMembroEquipe(equipe.id); setMembroSelecionado('') }} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Adicionar membro
              </button>
            )}
          </div>
        ))}
      </div>

      {equipes.length === 0 && !showNova && (
        <div className="card text-center py-12 text-gray-400">
          <UsersRound className="w-12 h-12 mx-auto mb-3 opacity-30" />
          Nenhuma equipe cadastrada
        </div>
      )}
    </div>
  )
}
