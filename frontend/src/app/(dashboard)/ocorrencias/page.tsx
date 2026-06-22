'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Ocorrencia, Imovel } from '@/types'
import { Search, ClipboardList, Plus, X, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

export default function OcorrenciasPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [inscricao, setInscricao] = useState('')
  const [busca, setBusca] = useState('')

  // Modal nova ocorrência
  const [showModal, setShowModal] = useState(false)
  const [formImovelId, setFormImovelId] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [imovelSearch, setImovelSearch] = useState('')

  // Modal edição
  const [editando, setEditando] = useState<Ocorrencia | null>(null)
  const [editDescricao, setEditDescricao] = useState('')

  const { data: imoveis = [] } = useQuery<Imovel[]>({
    queryKey: ['imoveis'],
    queryFn: () => api.get('/api/imoveis').then(r => r.data)
  })

  const { data: ocorrencias = [], isLoading } = useQuery<Ocorrencia[]>({
    queryKey: ['ocorrencias', busca],
    queryFn: () => api.get('/api/ocorrencias', { params: busca ? { inscricao: busca } : {} }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/ocorrencias', { imovelId: formImovelId, descricao: formDescricao, tipo: 'MANUAL' }),
    onSuccess: () => {
      toast.success('Ocorrência registrada')
      qc.invalidateQueries({ queryKey: ['ocorrencias'] })
      setShowModal(false)
      setFormImovelId('')
      setFormDescricao('')
      setImovelSearch('')
    },
    onError: () => toast.error('Erro ao registrar ocorrência')
  })

  const editMutation = useMutation({
    mutationFn: () => api.put(`/api/ocorrencias/${editando!.id}`, { descricao: editDescricao }),
    onSuccess: () => {
      toast.success('Ocorrência atualizada')
      qc.invalidateQueries({ queryKey: ['ocorrencias'] })
      setEditando(null)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao editar ocorrência')
  })

  const imoveisFiltrados = imoveis.filter(im =>
    im.inscricaoImobiliaria.toLowerCase().includes(imovelSearch.toLowerCase()) ||
    im.logradouro.toLowerCase().includes(imovelSearch.toLowerCase())
  ).slice(0, 8)

  const imovelSelecionado = imoveis.find(im => im.id === formImovelId)

  const TIPO_COLORS: Record<string, string> = {
    MANUAL: 'bg-gray-100 text-gray-600',
    TAREFA: 'bg-blue-100 text-blue-600',
  }

  const podeEditar = (oc: Ocorrencia) => oc.tipo === 'MANUAL' && oc.userId === user?.id

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ficha de Ocorrências</h1>
          <p className="text-gray-500 mt-0.5">Histórico de movimentações dos imóveis</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Nova Ocorrência
        </button>
      </div>

      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por inscrição imobiliária..."
              value={inscricao}
              onChange={e => setInscricao(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setBusca(inscricao)}
            />
          </div>
          <button onClick={() => setBusca(inscricao)} className="btn-primary">
            <Search className="w-4 h-4" /> Buscar
          </button>
          {busca && (
            <button onClick={() => { setBusca(''); setInscricao('') }} className="btn-secondary">
              Limpar
            </button>
          )}
        </div>
        {busca && (
          <div className="mt-3 text-sm text-gray-500">
            Mostrando ocorrências do imóvel: <span className="font-mono font-semibold text-primary-700">{busca}</span>
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : ocorrencias.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma ocorrência encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Inscrição</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Endereço</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ocorrência</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Usuário</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ocorrencias.map(oc => (
                  <tr key={oc.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {format(new Date(oc.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-primary-700 whitespace-nowrap">
                      {oc.imovel?.inscricaoImobiliaria}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                      {oc.imovel ? `${oc.imovel.logradouro}, ${oc.imovel.bairro}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[oc.tipo] || 'bg-gray-100 text-gray-600'}`}>
                        {oc.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-sm">{oc.descricao}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{oc.user?.name}</td>
                    <td className="px-4 py-3">
                      {podeEditar(oc) && (
                        <button
                          onClick={() => { setEditando(oc); setEditDescricao(oc.descricao) }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                          title="Editar ocorrência"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nova Ocorrência */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Nova Ocorrência Manual</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="label">Imóvel</label>
                {imovelSelecionado ? (
                  <div className="flex items-center justify-between p-3 bg-primary-50 border border-primary-200 rounded-lg">
                    <div>
                      <p className="text-xs font-mono font-semibold text-primary-700">{imovelSelecionado.inscricaoImobiliaria}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{imovelSelecionado.logradouro}, {imovelSelecionado.bairro}</p>
                    </div>
                    <button onClick={() => { setFormImovelId(''); setImovelSearch('') }} className="p-1 hover:bg-primary-100 rounded">
                      <X className="w-3.5 h-3.5 text-primary-500" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className="input"
                      placeholder="Buscar por inscrição ou endereço..."
                      value={imovelSearch}
                      onChange={e => setImovelSearch(e.target.value)}
                      autoFocus
                    />
                    {imovelSearch && (
                      <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                        {imoveisFiltrados.length === 0 ? (
                          <p className="text-xs text-gray-400 p-3">Nenhum imóvel encontrado</p>
                        ) : imoveisFiltrados.map(im => (
                          <button
                            key={im.id}
                            onClick={() => { setFormImovelId(im.id); setImovelSearch('') }}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                          >
                            <span className="text-xs font-mono font-semibold text-primary-700">{im.inscricaoImobiliaria}</span>
                            <span className="text-xs text-gray-500 ml-2">{im.logradouro}, {im.bairro}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="label">Descrição da Ocorrência</label>
                <textarea
                  className="input min-h-24 resize-none"
                  placeholder="Descreva a ocorrência..."
                  value={formDescricao}
                  onChange={e => setFormDescricao(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">
                Cancelar
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!formImovelId || !formDescricao.trim() || createMutation.isPending}
                className="btn-primary flex-1 justify-center"
              >
                {createMutation.isPending ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Ocorrência */}
      {editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Editar Ocorrência</h2>
              <button onClick={() => setEditando(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                <span className="font-mono font-semibold text-primary-700">{editando.imovel?.inscricaoImobiliaria}</span>
                {editando.imovel && <span className="ml-2">{editando.imovel.logradouro}, {editando.imovel.bairro}</span>}
              </div>
              <label className="label">Descrição</label>
              <textarea
                className="input min-h-28 resize-none"
                value={editDescricao}
                onChange={e => setEditDescricao(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setEditando(null)} className="btn-secondary flex-1 justify-center">
                Cancelar
              </button>
              <button
                onClick={() => editMutation.mutate()}
                disabled={!editDescricao.trim() || editMutation.isPending}
                className="btn-primary flex-1 justify-center"
              >
                {editMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
