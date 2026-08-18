'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { api } from '@/lib/api'
import { StatusAtividade, Prioridade, TemposAtividade } from '@/types'
import { ListTodo, Clock, AlertTriangle, ArrowUp, Minus, ArrowDown, Sparkles, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface AtividadeFila {
  id: string
  titulo: string
  instrucoes?: string
  status: StatusAtividade
  prioridade: Prioridade
  prazo?: string | null
  createdAt: string
  equipe: { id: string; nome: string } | null
  solicitante: { id: string; name: string }
  demanda: { id: string; gepNumero: string; gepAno: string; assunto: string; prioridade: Prioridade }
  tempos: TemposAtividade
}

const STATUS_LABEL: Record<StatusAtividade, string> = {
  ATRIBUIDA: 'Nova',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_INFORMACAO: 'Aguardando informação',
  CONCLUIDA: 'Concluída (aguardando aprovação)',
  DEVOLVIDA: 'Devolvida para correção',
  APROVADA: 'Aprovada',
  REABERTA: 'Reaberta',
  CANCELADA: 'Cancelada',
}

const STATUS_COLOR: Record<StatusAtividade, string> = {
  ATRIBUIDA: 'bg-gray-100 text-gray-600',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  AGUARDANDO_INFORMACAO: 'bg-purple-100 text-purple-700',
  CONCLUIDA: 'bg-amber-100 text-amber-700',
  DEVOLVIDA: 'bg-orange-100 text-orange-700',
  APROVADA: 'bg-green-100 text-green-700',
  REABERTA: 'bg-indigo-100 text-indigo-700',
  CANCELADA: 'bg-red-100 text-red-700',
}

const PRIORIDADE_LABEL: Record<Prioridade, string> = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' }
const PRIORIDADE_COLOR: Record<Prioridade, string> = {
  ALTA: 'bg-red-100 text-red-700', MEDIA: 'bg-amber-100 text-amber-700', BAIXA: 'bg-gray-100 text-gray-600',
}
const PRIORIDADE_ICONE: Record<Prioridade, typeof ArrowUp> = { ALTA: ArrowUp, MEDIA: Minus, BAIXA: ArrowDown }

// DEVOLVIDA entra na fila normal — é trabalho pendente que precisa de correção, tão urgente
// quanto uma atividade recém-atribuída (ver ordenação por prioridade abaixo).
const ATIVAS: StatusAtividade[] = ['ATRIBUIDA', 'EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO', 'REABERTA', 'DEVOLVIDA']

type Aba = 'fila' | 'andamento' | 'devolvidas' | 'concluidas' | 'historico'

export default function MinhaFilaPage() {
  const [aba, setAba] = useState<Aba>('fila')

  const { data: atividades = [], isLoading } = useQuery<AtividadeFila[]>({
    queryKey: ['minha-fila'],
    queryFn: () => api.get('/api/demandas/atividades/minhas', { params: { todas: 'true' } }).then(r => r.data),
    refetchInterval: 60_000,
  })

  const atrasada = (a: AtividadeFila) => !!a.prazo && new Date(a.prazo) < new Date() && ATIVAS.includes(a.status)

  const indicadores = {
    novas: atividades.filter(a => a.status === 'ATRIBUIDA').length,
    pendentes: atividades.filter(a => ATIVAS.includes(a.status)).length,
    emAndamento: atividades.filter(a => a.status === 'EM_ANDAMENTO').length,
    devolvidas: atividades.filter(a => a.status === 'DEVOLVIDA').length,
    concluidas: atividades.filter(a => ['CONCLUIDA', 'APROVADA'].includes(a.status)).length,
    atrasadas: atividades.filter(atrasada).length,
    prioridadeAlta: atividades.filter(a => ATIVAS.includes(a.status) && a.prioridade === 'ALTA').length,
  }

  const porAba: Record<Aba, AtividadeFila[]> = {
    fila: atividades.filter(a => ATIVAS.includes(a.status)),
    andamento: atividades.filter(a => a.status === 'EM_ANDAMENTO'),
    devolvidas: atividades.filter(a => a.status === 'DEVOLVIDA'),
    concluidas: atividades.filter(a => ['CONCLUIDA', 'APROVADA'].includes(a.status)),
    historico: atividades,
  }

  const abas: { key: Aba; label: string }[] = [
    { key: 'fila', label: 'Minha fila' },
    { key: 'andamento', label: 'Em andamento' },
    { key: 'devolvidas', label: 'Devolvidas' },
    { key: 'concluidas', label: 'Concluídas' },
    { key: 'historico', label: 'Histórico' },
  ]

  const lista = porAba[aba]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ListTodo className="w-6 h-6 text-primary-600" /> Minha Fila
        </h1>
        <p className="text-gray-500 text-sm">Suas tarefas, ordenadas por prioridade e antiguidade</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        {[
          { label: 'Novas', valor: indicadores.novas, cor: 'text-gray-700' },
          { label: 'Pendentes', valor: indicadores.pendentes, cor: 'text-gray-700' },
          { label: 'Em andamento', valor: indicadores.emAndamento, cor: 'text-blue-600' },
          { label: 'Devolvidas', valor: indicadores.devolvidas, cor: 'text-orange-600' },
          { label: 'Concluídas', valor: indicadores.concluidas, cor: 'text-green-600' },
          { label: 'Atrasadas', valor: indicadores.atrasadas, cor: 'text-red-600' },
          { label: 'Prioridade alta', valor: indicadores.prioridadeAlta, cor: 'text-red-600' },
        ].map(i => (
          <div key={i.label} className="card py-3">
            <p className="text-[11px] text-gray-500">{i.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${i.cor}`}>{i.valor}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {abas.map(t => (
          <button
            key={t.key}
            onClick={() => setAba(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === t.key ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card text-center py-8 text-gray-400">Carregando...</div>
      ) : lista.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-30" />
          Nenhuma tarefa nesta lista
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(a => {
            const Icone = PRIORIDADE_ICONE[a.prioridade]
            const atrasadaFlag = atrasada(a)
            const nova = a.status === 'ATRIBUIDA'
            return (
              <Link
                key={a.id}
                href={`/demandas/${a.demanda.id}`}
                className={`card flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-md transition-shadow ${a.status === 'DEVOLVIDA' ? 'border-orange-300' : atrasadaFlag ? 'border-red-300' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-primary-700">{a.demanda.gepNumero}/{a.demanda.gepAno}</span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PRIORIDADE_COLOR[a.prioridade]}`}>
                      <Icone className="w-3 h-3" /> {PRIORIDADE_LABEL[a.prioridade]}
                    </span>
                    {a.status === 'DEVOLVIDA' && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
                        <RotateCcw className="w-3 h-3" /> Atividade devolvida
                      </span>
                    )}
                    {nova && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-primary-100 text-primary-700">
                        <Sparkles className="w-3 h-3" /> Nova
                      </span>
                    )}
                    {atrasadaFlag && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                        <AlertTriangle className="w-3 h-3" /> Atrasada
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-800 mt-1">{a.titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.demanda.assunto}</p>
                  {a.instrucoes && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">Solicitação: {a.instrucoes}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {a.equipe ? `Equipe: ${a.equipe.nome} · ` : ''}Solicitante: {a.solicitante.name} · Atribuída em {format(new Date(a.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                    {a.prazo && ` · Prazo: ${format(new Date(a.prazo), 'dd/MM/yy', { locale: ptBR })}`}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> espera: {a.tempos.tempoEspera.texto}
                    {a.tempos.tempoExecucao && ` · execução: ${a.tempos.tempoExecucao.texto}`}
                    {' · total: '}{a.tempos.tempoTotal.texto}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap self-start sm:self-center ${STATUS_COLOR[a.status]}`}>
                  {STATUS_LABEL[a.status]}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
