'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Ocorrencia, Imovel } from '@/types'
import { Search, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function OcorrenciasPage() {
  const [inscricao, setInscricao] = useState('')
  const [busca, setBusca] = useState('')

  const { data: imoveis = [] } = useQuery<Imovel[]>({
    queryKey: ['imoveis'],
    queryFn: () => api.get('/api/imoveis').then(r => r.data)
  })

  const { data: ocorrencias = [], isLoading } = useQuery<Ocorrencia[]>({
    queryKey: ['ocorrencias', busca],
    queryFn: () => api.get('/api/ocorrencias', { params: busca ? { inscricao: busca } : {} }).then(r => r.data),
  })

  const TIPO_COLORS: Record<string, string> = {
    MANUAL: 'bg-gray-100 text-gray-600',
    TAREFA: 'bg-blue-100 text-blue-600',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ficha de Ocorrências</h1>
        <p className="text-gray-500 mt-0.5">Histórico de movimentações dos imóveis</p>
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
            />
          </div>
          <button
            onClick={() => setBusca(inscricao)}
            className="btn-primary"
          >
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ocorrencias.map(oc => (
                  <tr key={oc.id} className="hover:bg-gray-50">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
