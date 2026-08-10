'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Building2, ClipboardList, MapPin, Home, FileStack, AlertTriangle, Gauge, Timer,
  RotateCcw, CheckCircle2, TrendingUp, TrendingDown, Inbox, ClipboardCheck, ArrowUp, Minus, ArrowDown,
} from 'lucide-react'
import Link from 'next/link'
import { Imovel, Ocorrencia, Demanda, Prioridade } from '@/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const PRIORIDADE_LABEL: Record<Prioridade, string> = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' }
const PRIORIDADE_ICONE: Record<Prioridade, typeof ArrowUp> = { ALTA: ArrowUp, MEDIA: Minus, BAIXA: ArrowDown }
const PRIORIDADE_COLOR: Record<Prioridade, string> = {
  ALTA: 'bg-red-100 text-red-700', MEDIA: 'bg-amber-100 text-amber-700', BAIXA: 'bg-gray-100 text-gray-600',
}

interface PainelDemandas {
  totalDemandas: number
  totalAtivas: number
  totalAtrasadas: number
  percentualAtrasadas: number
  minhasAtividadesPendentes: number
  aguardandoMinhaAprovacao: number
  porStatus: Record<string, number>
  porPrioridade: Record<Prioridade, number>
  concluidasEsteMes: number
  concluidasMesAnterior: number
  tempoMedioConclusaoDias: number | null
  taxaDevolucao: number
  atrasadasNaMinhaEquipe: number
  alertaCruzadoPrazo: number
}

function KpiCard({ icon: Icon, label, value, sub, tone = 'text-gray-800', href }: {
  icon: typeof Gauge; label: string; value: React.ReactNode; sub?: string; tone?: string; href?: string
}) {
  const content = (
    <>
      <p className="text-xs text-gray-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </>
  )
  return href ? (
    <Link href={href} className="card py-3 hover:shadow-md transition-shadow block">{content}</Link>
  ) : (
    <div className="card py-3">{content}</div>
  )
}

export default function DashboardPage() {
  const { data: imoveis = [] } = useQuery<Imovel[]>({ queryKey: ['imoveis'], queryFn: () => api.get('/api/imoveis').then(r => r.data) })
  const { data: ocorrencias = [] } = useQuery<Ocorrencia[]>({ queryKey: ['ocorrencias'], queryFn: () => api.get('/api/ocorrencias').then(r => r.data) })
  const { data: painel } = useQuery<PainelDemandas>({
    queryKey: ['demandas-painel'],
    queryFn: () => api.get('/api/demandas/painel/resumo').then(r => r.data),
    refetchInterval: 60_000,
  })
  const { data: demandasAtrasadas = [] } = useQuery<Demanda[]>({
    queryKey: ['demandas', 'atrasadas-resumo'],
    queryFn: () => api.get('/api/demandas', { params: { atrasadas: 'true' } }).then(r => r.data),
  })

  const proprios = imoveis.filter(i => i.tipo === 'PROPRIO').length
  const locados = imoveis.filter(i => i.tipo === 'LOCADO').length
  const comCoordenadas = imoveis.filter(i => i.latitude && i.longitude).length

  const imoveisCards = [
    { label: 'Total de Imóveis', value: imoveis.length, icon: Building2, color: 'bg-blue-500', href: '/imoveis' },
    { label: 'Imóveis Próprios', value: proprios, icon: Home, color: 'bg-emerald-500', href: '/imoveis?tipo=PROPRIO' },
    { label: 'Imóveis Locados', value: locados, icon: Building2, color: 'bg-amber-500', href: '/imoveis?tipo=LOCADO' },
    { label: 'Geo-referenciados', value: comCoordenadas, icon: MapPin, color: 'bg-rose-500', href: '/mapa' },
  ]

  const maxPrioridade = painel ? Math.max(1, painel.porPrioridade.ALTA, painel.porPrioridade.MEDIA, painel.porPrioridade.BAIXA) : 1

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Visão geral estratégica — imóveis públicos e processos GEP</p>
      </div>

      {/* ===== Demandas (Processos GEP) ===== */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <FileStack className="w-4 h-4 text-primary-600" /> Demandas — Processos GEP
          </h2>
          <Link href="/demandas" className="text-xs text-primary-600 hover:underline">Ver todas →</Link>
        </div>

        {painel && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <KpiCard icon={FileStack} label="Demandas em curso" value={painel.totalAtivas} sub={`${painel.totalDemandas} no total`} href="/demandas" />
            <KpiCard
              icon={Gauge} label="Taxa de atraso" value={`${painel.percentualAtrasadas}%`}
              sub={`${painel.totalAtrasadas} demanda(s) atrasada(s)`}
              tone={painel.percentualAtrasadas > 20 ? 'text-red-600' : painel.percentualAtrasadas > 5 ? 'text-amber-600' : 'text-emerald-600'}
              href="/demandas"
            />
            <KpiCard
              icon={Timer} label="Tempo médio de conclusão"
              value={painel.tempoMedioConclusaoDias !== null ? `${painel.tempoMedioConclusaoDias}d` : '—'}
              sub="do cadastro à conclusão"
            />
            <KpiCard
              icon={RotateCcw} label="Taxa de devolução" value={`${painel.taxaDevolucao}%`}
              sub="atividades já devolvidas"
              tone={painel.taxaDevolucao > 25 ? 'text-red-600' : painel.taxaDevolucao > 10 ? 'text-amber-600' : 'text-emerald-600'}
            />
          </div>
        )}

        {painel && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard
              icon={CheckCircle2} label="Concluídas este mês"
              value={(
                <span className="flex items-center gap-1.5">
                  {painel.concluidasEsteMes}
                  {painel.concluidasMesAnterior > 0 && (
                    painel.concluidasEsteMes >= painel.concluidasMesAnterior
                      ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                      : <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                </span>
              )}
              sub={`mês anterior: ${painel.concluidasMesAnterior}`}
            />
            <KpiCard icon={Inbox} label="Minhas atividades pendentes" value={painel.minhasAtividadesPendentes} tone="text-blue-600" href="/minha-fila" />
            <KpiCard icon={ClipboardCheck} label="Aguardando minha aprovação" value={painel.aguardandoMinhaAprovacao} tone="text-amber-600" />
            <div className="card py-3">
              <p className="text-xs text-gray-500 mb-1.5">Prioridade (demandas em curso)</p>
              <div className="flex items-end gap-1.5 h-8">
                {(['ALTA', 'MEDIA', 'BAIXA'] as Prioridade[]).map(p => {
                  const Icone = PRIORIDADE_ICONE[p]
                  const altura = (painel.porPrioridade[p] / maxPrioridade) * 100
                  return (
                    <div key={p} className="flex-1 flex flex-col items-center justify-end h-full" title={`${PRIORIDADE_LABEL[p]}: ${painel.porPrioridade[p]}`}>
                      <Icone className="w-2.5 h-2.5 text-gray-400 mb-0.5" />
                      <span className="text-[10px] font-semibold text-gray-600">{painel.porPrioridade[p]}</span>
                      <div className={`w-full rounded-t ${p === 'ALTA' ? 'bg-red-400' : p === 'MEDIA' ? 'bg-amber-400' : 'bg-gray-300'}`} style={{ height: `${Math.max(altura, 8)}%` }} />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {painel && painel.alertaCruzadoPrazo > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>{painel.alertaCruzadoPrazo}</strong> demanda(s) com o prazo geral vencido, mas cuja atividade em curso ainda não venceu no setor responsável — o card de atraso da equipe não vai sinalizar isso, só o prazo macro da demanda.
            </span>
          </div>
        )}

        <div className="card">
          <h3 className="font-semibold text-sm text-gray-800 mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Demandas atrasadas — atenção prioritária
          </h3>
          {demandasAtrasadas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma demanda atrasada no momento 🎉</p>
          ) : (
            <div className="space-y-2">
              {demandasAtrasadas.slice(0, 6).map(d => {
                const Icone = PRIORIDADE_ICONE[d.prioridade]
                const diasAtraso = d.prazo ? Math.floor((Date.now() - new Date(d.prazo).getTime()) / 86400000) : 0
                return (
                  <Link key={d.id} href={`/demandas/${d.id}`} className="flex items-center gap-3 text-sm hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-lg transition-colors">
                    <span className="font-mono text-xs font-semibold text-primary-700 flex-shrink-0">{d.gepNumero}/{d.gepAno}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-700">{d.assunto}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${PRIORIDADE_COLOR[d.prioridade]}`}>
                      <Icone className="w-2.5 h-2.5" /> {PRIORIDADE_LABEL[d.prioridade]}
                    </span>
                    <span className="text-[11px] text-red-600 font-medium flex-shrink-0">{diasAtraso}d atraso</span>
                  </Link>
                )
              })}
              {demandasAtrasadas.length > 6 && (
                <Link href="/demandas" className="block text-center text-xs text-primary-600 hover:underline pt-1">
                  + {demandasAtrasadas.length - 6} outra(s) — ver todas
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Imóveis Públicos ===== */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" /> Imóveis Públicos
          </h2>
          <Link href="/imoveis" className="text-xs text-primary-600 hover:underline">Ver todos →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {imoveisCards.map(({ label, value, icon: Icon, color, href }) => (
            <Link key={label} href={href} className="card hover:shadow-md transition-shadow group py-3">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{label}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-purple-500" />
            Últimas Ocorrências
          </h2>
          <div className="space-y-3">
            {ocorrencias.slice(0, 5).map(oc => (
              <div key={oc.id} className="flex gap-3 text-sm">
                <div className="flex-shrink-0 w-1 bg-purple-200 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-700 truncate">{oc.descricao}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {oc.user?.name} · {format(new Date(oc.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            ))}
            {ocorrencias.length === 0 && <p className="text-gray-400 text-sm">Nenhuma ocorrência registrada</p>}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            Últimos Imóveis Cadastrados
          </h2>
          <div className="space-y-3">
            {imoveis.slice(0, 5).map(im => (
              <Link key={im.id} href={`/imoveis/${im.id}`} className="flex gap-3 text-sm hover:bg-gray-50 -mx-2 px-2 py-1 rounded-lg transition-colors">
                <div className="flex-shrink-0 w-1 bg-blue-200 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-700 truncate">{im.inscricaoImobiliaria}</p>
                  <p className="text-gray-400 text-xs mt-0.5 truncate">{im.logradouro}, {im.bairro} · {im.secretaria}</p>
                </div>
                <div className={im.tipo === 'PROPRIO' ? 'badge-proprio' : 'badge-locado'}>{im.tipo}</div>
              </Link>
            ))}
            {imoveis.length === 0 && <p className="text-gray-400 text-sm">Nenhum imóvel cadastrado</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
