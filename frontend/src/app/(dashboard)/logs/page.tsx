'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Log } from '@/types'
import { ScrollText, Search } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/hooks/useAuth'

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-emerald-100 text-emerald-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  CREATE: 'bg-blue-100 text-blue-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  IMPORT: 'bg-purple-100 text-purple-700',
  MOVE: 'bg-indigo-100 text-indigo-700',
}

export default function LogsPage() {
  const { isMaster } = useAuth()
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data: logs = [], isLoading } = useQuery<Log[]>({
    queryKey: ['logs', entity, action, from, to],
    queryFn: () => api.get('/api/logs', { params: { entity: entity || undefined, action: action || undefined, from: from || undefined, to: to || undefined } }).then(r => r.data)
  })

  if (!isMaster) return <div className="p-8 text-center text-gray-400">Acesso restrito ao administrador</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Logs do Sistema</h1>
        <p className="text-gray-500 mt-0.5">Registro de todas as ações realizadas no sistema</p>
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className="input text-sm" value={entity} onChange={e => setEntity(e.target.value)}>
            <option value="">Todas entidades</option>
            <option value="USER">Usuário</option>
            <option value="IMOVEL">Imóvel</option>
            <option value="OCORRENCIA">Ocorrência</option>
            <option value="TAREFA">Tarefa</option>
            <option value="TAREFA_CARD">Tarefa Card</option>
            <option value="DOCUMENTO">Documento</option>
          </select>
          <select className="input text-sm" value={action} onChange={e => setAction(e.target.value)}>
            <option value="">Todas as ações</option>
            <option value="LOGIN">Login</option>
            <option value="LOGOUT">Logout</option>
            <option value="CREATE">Criação</option>
            <option value="UPDATE">Atualização</option>
            <option value="DELETE">Exclusão</option>
            <option value="IMPORT">Importação</option>
            <option value="MOVE">Movimentação</option>
          </select>
          <input type="date" className="input text-sm" value={from} onChange={e => setFrom(e.target.value)} placeholder="De" />
          <input type="date" className="input text-sm" value={to} onChange={e => setTo(e.target.value)} placeholder="Até" />
        </div>
        <p className="text-xs text-gray-400 mt-2">Exibindo últimos 500 registros</p>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center">
            <ScrollText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">Nenhum log encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data/Hora</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Usuário</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ação</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Entidade</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Detalhes</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs whitespace-nowrap">
                      {log.user?.name || '—'}
                      {log.user?.email && <span className="text-gray-400 block">{log.user.email}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">
                      {log.entity}
                      {log.entityId && <span className="text-gray-400 block font-mono text-xs">{log.entityId.substring(0, 8)}...</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs max-w-xs truncate">{log.details || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">{log.ip || '—'}</td>
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
