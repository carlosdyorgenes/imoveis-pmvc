'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Perfil, PermissaoDisponivel, User } from '@/types'
import { Plus, X, Trash2, ShieldCheck, UserCog } from 'lucide-react'
import toast from 'react-hot-toast'

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

export default function PerfisPage() {
  const qc = useQueryClient()
  const [showNovo, setShowNovo] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [permissoesSelecionadas, setPermissoesSelecionadas] = useState<string[]>([])

  const [atribuindoUsuario, setAtribuindoUsuario] = useState<string | null>(null)
  const [perfilEscolhido, setPerfilEscolhido] = useState('')

  const { data: perfis = [] } = useQuery<Perfil[]>({
    queryKey: ['perfis'],
    queryFn: () => api.get('/api/perfis').then(r => r.data),
  })

  const { data: permissoesDisponiveis = [] } = useQuery<PermissaoDisponivel[]>({
    queryKey: ['permissoes-disponiveis'],
    queryFn: () => api.get('/api/perfis/permissoes-disponiveis').then(r => r.data),
  })

  const { data: usuarios = [] } = useQuery<User[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/api/usuarios').then(r => r.data),
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['perfis'] })
    qc.invalidateQueries({ queryKey: ['usuarios'] })
  }

  const createPerfil = useMutation({
    mutationFn: () => api.post('/api/perfis', { nome, descricao, permissoes: permissoesSelecionadas }),
    onSuccess: () => { invalidar(); setShowNovo(false); setNome(''); setDescricao(''); setPermissoesSelecionadas([]); toast.success('Perfil criado') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao criar perfil'))
  })

  const deletePerfil = useMutation({
    mutationFn: (id: string) => api.delete(`/api/perfis/${id}`),
    onSuccess: () => { invalidar(); toast.success('Perfil removido') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover perfil'))
  })

  const atribuirPerfil = useMutation({
    mutationFn: (userId: string) => api.put(`/api/perfis/usuarios/${userId}`, { perfilId: perfilEscolhido || null }),
    onSuccess: () => { invalidar(); setAtribuindoUsuario(null); toast.success('Perfil do usuário atualizado') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao atribuir perfil'))
  })

  const togglePermissao = (chave: string) => {
    setPermissoesSelecionadas(prev => prev.includes(chave) ? prev.filter(p => p !== chave) : [...prev, chave])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Perfis de Acesso</h1>
          <p className="text-gray-500 text-sm">
            Conceda permissões específicas a usuários PADRAO sem torná-los Master. O usuário Master sempre tem acesso total.
          </p>
        </div>
        <button onClick={() => setShowNovo(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Novo Perfil
        </button>
      </div>

      {showNovo && (
        <div className="card mb-6 space-y-3">
          <div>
            <label className="label">Nome do perfil</label>
            <input className="input" placeholder="Ex: Coordenador de Equipes" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input" value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>
          <div>
            <label className="label">Permissões</label>
            <div className="space-y-2">
              {permissoesDisponiveis.map(p => (
                <label key={p.chave} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissoesSelecionadas.includes(p.chave)}
                    onChange={() => togglePermissao(p.chave)}
                    className="w-4 h-4 accent-primary-600 mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-mono text-gray-700">{p.chave}</p>
                    <p className="text-xs text-gray-500">{p.descricao}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowNovo(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
            <button onClick={() => nome.trim() && createPerfil.mutate()} disabled={!nome.trim()} className="btn-primary flex-1 justify-center text-xs">Criar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {perfis.map(perfil => (
          <div key={perfil.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary-600" />
                <h3 className="font-semibold text-gray-800">{perfil.nome}</h3>
              </div>
              <button onClick={() => confirm(`Excluir o perfil "${perfil.nome}"?`) && deletePerfil.mutate(perfil.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {perfil.descricao && <p className="text-xs text-gray-500 mb-2">{perfil.descricao}</p>}
            <div className="flex flex-wrap gap-1 mb-2">
              {perfil.permissoes.map(p => (
                <span key={p} className="text-[10px] bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-mono">{p}</span>
              ))}
              {perfil.permissoes.length === 0 && <span className="text-xs text-gray-400">Sem permissões</span>}
            </div>
            <p className="text-xs text-gray-400">{perfil.usuarios.length} usuário(s) com este perfil</p>
          </div>
        ))}
        {perfis.length === 0 && !showNovo && (
          <div className="card text-center py-8 text-gray-400 md:col-span-2">
            <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            Nenhum perfil criado ainda
          </div>
        )}
      </div>

      <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
        <UserCog className="w-4 h-4 text-primary-600" /> Perfil por usuário
      </h2>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Usuário</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Papel</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Perfil atribuído</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {usuarios.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700">{u.name}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'MASTER' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{u.role}</span>
                </td>
                <td className="px-3 py-2">
                  {atribuindoUsuario === u.id ? (
                    <select className="input text-xs py-1" value={perfilEscolhido} onChange={e => setPerfilEscolhido(e.target.value)} autoFocus>
                      <option value="">Sem perfil</option>
                      {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-600">{u.perfil?.nome || '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {atribuindoUsuario === u.id ? (
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => atribuirPerfil.mutate(u.id)} className="btn-primary text-xs py-1">Salvar</button>
                      <button onClick={() => setAtribuindoUsuario(null)} className="btn-secondary text-xs py-1"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    u.role !== 'MASTER' && (
                      <button onClick={() => { setAtribuindoUsuario(u.id); setPerfilEscolhido(u.perfil?.id || '') }} className="text-xs text-primary-600 hover:underline">
                        Alterar
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
