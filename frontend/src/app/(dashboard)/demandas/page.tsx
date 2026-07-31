'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Demanda, StatusDemanda } from '@/types'
import Link from 'next/link'
import { Plus, Search, X, FileStack } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

const STATUS_LABEL: Record<StatusDemanda, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_TERCEIRO: 'Aguardando terceiro',
  DEVOLVIDA: 'Devolvida',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
}

const STATUS_COLOR: Record<StatusDemanda, string> = {
  ABERTA: 'bg-gray-100 text-gray-600',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  AGUARDANDO_TERCEIRO: 'bg-amber-100 text-amber-700',
  DEVOLVIDA: 'bg-orange-100 text-orange-700',
  CONCLUIDA: 'bg-green-100 text-green-700',
  CANCELADA: 'bg-red-100 text-red-700',
}

export default function DemandasPage() {
  const qc = useQueryClient()
  const [gepBusca, setGepBusca] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [gepNumero, setGepNumero] = useState('')
  const [gepAno, setGepAno] = useState(String(new Date().getFullYear()))
  const [assunto, setAssunto] = useState('')
  const [interessado, setInteressado] = useState('')
  const [descricao, setDescricao] = useState('')

  const { data: demandas = [], isLoading } = useQuery<Demanda[]>({
    queryKey: ['demandas', gepBusca],
    queryFn: () => api.get('/api/demandas', { params: gepBusca ? { gep: gepBusca } : {} }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/demandas', { gepNumero, gepAno, assunto, interessado, descricao }),
    onSuccess: (res) => {
      toast.success('Demanda criada')
      if (res.data.avisoGepDuplicado) toast(res.data.avisoGepDuplicado, { icon: '⚠️' })
      qc.invalidateQueries({ queryKey: ['demandas'] })
      setShowModal(false)
      setGepNumero(''); setAssunto(''); setInteressado(''); setDescricao('')
    },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao criar demanda'))
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demandas</h1>
          <p className="text-gray-500 text-sm">Processos de regularização por GEP</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Nova Demanda
        </button>
      </div>

      <div className="card mb-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por número do GEP..."
            value={gepBusca}
            onChange={e => setGepBusca(e.target.value)}
          />
        </div>
      </div>

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
                <col className="w-[110px]" /><col className="w-[130px]" /><col className="w-[110px]" />
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">GEP</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Assunto</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Interessado</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Atividades</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Criada em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {demandas.map(d => (
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
                    <td className="px-3 py-2 align-top">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 align-top">{d.atividades?.length || 0}</td>
                    <td className="px-3 py-2 text-xs text-gray-400 align-top">
                      {format(new Date(d.createdAt), 'dd/MM/yy', { locale: ptBR })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Nova Demanda</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Número do GEP *</label>
                  <input className="input" placeholder="126158" value={gepNumero} onChange={e => setGepNumero(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="label">Ano *</label>
                  <input className="input" placeholder="2025" value={gepAno} onChange={e => setGepAno(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Assunto *</label>
                <input className="input" placeholder="Ex: Revalidação de alvará" value={assunto} onChange={e => setAssunto(e.target.value)} />
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
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button
                onClick={() => gepNumero.trim() && gepAno.trim() && assunto.trim() && createMutation.mutate()}
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
