'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Demanda, Atividade, StatusAtividade, User, Equipe, Prioridade } from '@/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X, CheckCircle2, ListChecks, Clock, FileText, Building2, ExternalLink, Trash2, AlertTriangle, ShieldCheck, Repeat, RotateCcw, ArrowUp, Minus, ArrowDown, Pencil, Check, StickyNote } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/hooks/useAuth'

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

const STATUS_ATIV_LABEL: Record<StatusAtividade, string> = {
  ATRIBUIDA: 'Atribuída',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_INFORMACAO: 'Aguardando informação',
  CONCLUIDA: 'Concluída (aguardando aprovação)',
  DEVOLVIDA: 'Devolvida para correção',
  APROVADA: 'Aprovada',
  REABERTA: 'Reaberta',
  CANCELADA: 'Cancelada',
}

const STATUS_ATIV_COLOR: Record<StatusAtividade, string> = {
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

export default function DemandaDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const qc = useQueryClient()
  const router = useRouter()
  const { user, isMaster } = useAuth()

  const [showNovaAtividade, setShowNovaAtividade] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaEquipe, setNovaEquipe] = useState('')
  const [novasInstrucoes, setNovasInstrucoes] = useState('')
  const [novoAnexoObrigatorio, setNovoAnexoObrigatorio] = useState(false)
  const [novoPrazo, setNovoPrazo] = useState('')

  const [atividadeAberta, setAtividadeAberta] = useState<string | null>(null)
  const [novoPasso, setNovoPasso] = useState('')
  const [passoEditando, setPassoEditando] = useState<string | null>(null)
  const [textoEdicaoPasso, setTextoEdicaoPasso] = useState('')
  const [devolverMotivo, setDevolverMotivo] = useState('')
  const [showDevolver, setShowDevolver] = useState(false)
  const [novoDocNome, setNovoDocNome] = useState('')
  const [novoDocLink, setNovoDocLink] = useState('')

  const [showFinalizar, setShowFinalizar] = useState(false)
  const [infoFinalizacao, setInfoFinalizacao] = useState('')

  const [showTransferir, setShowTransferir] = useState(false)
  const [novoResponsavelTransfer, setNovoResponsavelTransfer] = useState('')
  const [justificativaTransfer, setJustificativaTransfer] = useState('')

  const [observacoesTexto, setObservacoesTexto] = useState('')

  const [showReabrir, setShowReabrir] = useState(false)
  const [motivoReabrir, setMotivoReabrir] = useState('')

  const [showPendencia, setShowPendencia] = useState(false)
  const [pOrgao, setPOrgao] = useState('')
  const [pDescricao, setPDescricao] = useState('')
  const [pProtocolo, setPProtocolo] = useState('')

  const [pendenciaEditando, setPendenciaEditando] = useState<string | null>(null)
  const [pOrgaoEdicao, setPOrgaoEdicao] = useState('')
  const [pDescricaoEdicao, setPDescricaoEdicao] = useState('')
  const [pProtocoloEdicao, setPProtocoloEdicao] = useState('')

  const { data: demanda, isLoading } = useQuery<Demanda>({
    queryKey: ['demanda', id],
    queryFn: () => api.get(`/api/demandas/${id}`).then(r => r.data),
  })

  const { data: usuarios = [] } = useQuery<User[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/api/usuarios').then(r => r.data),
  })

  const { data: equipes = [] } = useQuery<Equipe[]>({
    queryKey: ['equipes'],
    queryFn: () => api.get('/api/equipes').then(r => r.data),
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['demanda', id] })

  const deleteDemanda = useMutation({
    mutationFn: () => api.delete(`/api/demandas/${id}`),
    onSuccess: () => { toast.success('Demanda excluída'); router.push('/demandas') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao excluir demanda'))
  })

  const createAtividade = useMutation({
    mutationFn: () => api.post(`/api/demandas/${id}/atividades`, {
      titulo: novoTitulo,
      instrucoes: novasInstrucoes,
      equipeId: novaEquipe,
      anexoObrigatorio: novoAnexoObrigatorio,
      prazo: novoPrazo || null,
    }),
    onSuccess: (res) => {
      invalidar()
      toast.success(`Atividade atribuída a ${res.data.responsavel?.name || 'um membro da equipe'}`)
      setShowNovaAtividade(false); setNovoTitulo(''); setNovaEquipe(''); setNovasInstrucoes(''); setNovoAnexoObrigatorio(false); setNovoPrazo('')
    },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao criar atividade'))
  })

  const statusAtividade = useMutation({
    mutationFn: ({ atividadeId, status, motivo, informacoesFinalizacao }: { atividadeId: string; status: string; motivo?: string; informacoesFinalizacao?: string }) =>
      api.put(`/api/demandas/atividades/${atividadeId}/status`, { status, motivo, informacoesFinalizacao }),
    onSuccess: () => {
      invalidar(); toast.success('Atividade atualizada')
      setShowDevolver(false); setDevolverMotivo('')
      setShowFinalizar(false); setInfoFinalizacao('')
      setShowReabrir(false); setMotivoReabrir('')
    },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao atualizar atividade'))
  })

  const transferirAtividade = useMutation({
    mutationFn: ({ atividadeId, novoResponsavelId, justificativa }: { atividadeId: string; novoResponsavelId: string; justificativa: string }) =>
      api.put(`/api/demandas/atividades/${atividadeId}/transferir`, { novoResponsavelId, justificativa }),
    onSuccess: (_, vars) => {
      const nome = usuarios.find(u => u.id === vars.novoResponsavelId)?.name || ''
      toast.success(`Tarefa transferida para ${nome}`)
      setShowTransferir(false); setNovoResponsavelTransfer(''); setJustificativaTransfer('')
      setAtividadeAberta(null)
      // Depois de transferir, quem transferiu pode nao ter mais acesso a atividade (ou a
      // propria demanda). Volta pra listagem e forca recarregar os dados — inclusive o cache
      // de "Minha Fila" — pra nenhuma tela continuar mostrando a atividade que acabou de sair
      // das maos dela.
      qc.invalidateQueries({ queryKey: ['demandas'] })
      qc.invalidateQueries({ queryKey: ['minha-fila'] })
      router.push('/demandas')
      router.refresh()
    },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao transferir atividade'))
  })

  const addPasso = useMutation({
    mutationFn: (atividadeId: string) => api.post(`/api/demandas/atividades/${atividadeId}/passos`, { descricao: novoPasso }),
    onSuccess: () => { invalidar(); setNovoPasso('') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao adicionar passo'))
  })

  const togglePasso = useMutation({
    mutationFn: ({ id, concluido }: { id: string; concluido: boolean }) => api.put(`/api/demandas/passos/${id}`, { concluido }),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao atualizar passo'))
  })

  const editarPasso = useMutation({
    mutationFn: ({ id, descricao }: { id: string; descricao: string }) => api.put(`/api/demandas/passos/${id}`, { descricao }),
    onSuccess: () => { invalidar(); setPassoEditando(null); setTextoEdicaoPasso('') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao editar passo'))
  })

  const excluirPasso = useMutation({
    mutationFn: (id: string) => api.delete(`/api/demandas/passos/${id}`),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao excluir passo'))
  })

  const addDocumento = useMutation({
    mutationFn: (atividadeId: string) => api.post(`/api/demandas/atividades/${atividadeId}/documentos`, { nome: novoDocNome, linkDrive: novoDocLink }),
    onSuccess: () => { invalidar(); setNovoDocNome(''); setNovoDocLink(''); toast.success('Documento anexado') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao anexar documento'))
  })

  const uploadDocumento = useMutation({
    mutationFn: ({ atividadeId, arquivo }: { atividadeId: string; arquivo: File }) => {
      const fd = new FormData()
      fd.append('arquivo', arquivo)
      if (novoDocNome.trim()) fd.append('nome', novoDocNome.trim())
      return api.post(`/api/demandas/atividades/${atividadeId}/documentos/upload`, fd)
    },
    onSuccess: () => { invalidar(); setNovoDocNome(''); toast.success('Arquivo enviado') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao enviar arquivo'))
  })

  const baixarArquivo = async (docId: string, nome: string) => {
    try {
      const res = await api.get(`/api/demandas/documentos/${docId}/arquivo`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = nome; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao baixar arquivo')
    }
  }

  const deleteDocumento = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/demandas/documentos/${docId}`),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao remover documento'))
  })

  const verificarIntegridade = async (docId: string) => {
    try {
      const res = await api.get(`/api/demandas/documentos/${docId}/verificar-integridade`)
      if (res.data.integro) {
        toast.success('Arquivo íntegro — hash confere com o do envio original')
      } else {
        toast.error(`Integridade comprometida: ${res.data.motivo}`)
      }
    } catch (e: any) {
      toast.error(errMsg(e, 'Erro ao verificar integridade'))
    }
  }

  const createPendencia = useMutation({
    mutationFn: () => api.post(`/api/demandas/${id}/pendencias`, { orgao: pOrgao, descricao: pDescricao, protocolo: pProtocolo }),
    onSuccess: () => { invalidar(); setShowPendencia(false); setPOrgao(''); setPDescricao(''); setPProtocolo(''); toast.success('Pendência externa registrada') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao registrar pendência'))
  })

  const resolverPendencia = useMutation({
    mutationFn: (pendId: string) => api.put(`/api/demandas/pendencias/${pendId}`, { status: 'RESPONDIDA' }),
    onSuccess: () => { invalidar(); toast.success('Pendência marcada como respondida') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao atualizar pendência'))
  })

  const editarPendencia = useMutation({
    mutationFn: ({ id, orgao, descricao, protocolo }: { id: string; orgao: string; descricao: string; protocolo: string }) =>
      api.put(`/api/demandas/pendencias/${id}`, { orgao, descricao, protocolo }),
    onSuccess: () => { invalidar(); setPendenciaEditando(null); toast.success('Pendência atualizada') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao editar pendência'))
  })

  const excluirPendencia = useMutation({
    mutationFn: (id: string) => api.delete(`/api/demandas/pendencias/${id}`),
    onSuccess: () => { invalidar(); toast.success('Pendência removida') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao excluir pendência'))
  })


  useEffect(() => {
    const a = demanda?.atividades.find(a => a.id === atividadeAberta)
    setObservacoesTexto(a?.observacoes || '')
  }, [atividadeAberta, demanda])

  const salvarObservacoes = useMutation({
    mutationFn: ({ atividadeId, observacoes }: { atividadeId: string; observacoes: string }) =>
      api.put(`/api/demandas/atividades/${atividadeId}/observacoes`, { observacoes }),
    onSuccess: () => { invalidar(); toast.success('Observações salvas') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao salvar observações'))
  })

  if (isLoading) return <div className="p-8 text-center text-gray-400">Carregando...</div>
  if (!demanda) return <div className="p-8 text-center text-gray-400">Demanda não encontrada</div>

  const atividadeModal = demanda.atividades.find(a => a.id === atividadeAberta) || null
  // Só o responsável específico atribuído pela distribuição automática age na atividade — um
  // colega da mesma equipe que não foi o escolhido não é "responsável" (equipe só entra como
  // fallback no caso raro de a atividade não ter nenhum responsável individual definido).
  const isResponsavelUsuario = (a: Atividade) => a.responsavel?.id === user?.id
  const isMembroEquipe = (a: Atividade) => !!a.equipe && !!equipes.find(e => e.id === a.equipe!.id)?.membros.some(m => m.user.id === user?.id)
  const isResponsavel = (a: Atividade) => (a.responsavel ? isResponsavelUsuario(a) : isMembroEquipe(a))
  const isSolicitante = (a: Atividade) => a.solicitante.id === user?.id
  const podeGerenciarChecklist = (a: Atividade) => isMaster || isResponsavel(a) || isSolicitante(a)
  // Checklist, observações e documentos só ficam liberados depois que a atividade foi
  // iniciada ao menos uma vez (dataInicio preenchida) — antes disso, tudo fica bloqueado.
  const podeEditarCampos = (a: Atividade) => podeGerenciarChecklist(a) && !!a.dataInicio

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/demandas" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-mono flex items-center gap-2">
            GEP {demanda.gepNumero}/{demanda.gepAno}
            {(() => { const Icone = PRIORIDADE_ICONE[demanda.prioridade]; return (
              <span className={`text-xs px-2 py-0.5 rounded-full font-sans font-medium flex items-center gap-1 ${PRIORIDADE_COLOR[demanda.prioridade]}`}>
                <Icone className="w-3 h-3" /> {PRIORIDADE_LABEL[demanda.prioridade]}
              </span>
            )})()}
            {demanda.prazo && new Date(demanda.prazo) < new Date() && !['CONCLUIDA', 'CANCELADA'].includes(demanda.status) && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-sans font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Atrasada
              </span>
            )}
          </h1>
          <p className="text-gray-500 text-sm">
            {demanda.assunto}{demanda.interessado ? ` — ${demanda.interessado}` : ''}
            {demanda.prazo && <span className="ml-2 text-xs text-gray-400">Prazo: {format(new Date(demanda.prazo), 'dd/MM/yy', { locale: ptBR })}</span>}
          </p>
        </div>
        {isMaster && (
          <button
            onClick={() => confirm(`Excluir definitivamente a demanda GEP ${demanda.gepNumero}/${demanda.gepAno}?\n\nIsso apaga também todas as atividades, checklist, documentos e histórico relacionados. Esta ação não pode ser desfeita.`) && deleteDemanda.mutate()}
            className="ml-auto btn-danger text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" /> Excluir Demanda
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Atividades</h2>
            {(isMaster || demanda.solicitante.id === user?.id) && (
              <button onClick={() => { setNovoPrazo(demanda.prazo ? demanda.prazo.slice(0, 10) : ''); setShowNovaAtividade(true) }} className="btn-primary text-xs">
                <Plus className="w-3.5 h-3.5" /> Nova Atividade
              </button>
            )}
          </div>

          {showNovaAtividade && (
            <div className="card space-y-3">
              <div>
                <label className="label">Título da atividade</label>
                <input className="input" placeholder="Ex: Elaborar parecer jurídico" value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Equipe responsável</label>
                <select className="input" value={novaEquipe} onChange={e => setNovaEquipe(e.target.value)}>
                  <option value="">Selecione a equipe...</option>
                  {equipes.filter(e => e.ativo).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  A atividade é atribuída automaticamente a quem, na equipe, tiver menos atividades em aberto no momento.
                </p>
              </div>
              <div>
                <label className="label">Instruções / solicitação específica</label>
                <textarea className="input min-h-16 resize-none" placeholder="O que deve ser feito, qual resultado é esperado..." value={novasInstrucoes} onChange={e => setNovasInstrucoes(e.target.value)} />
              </div>
              <div>
                <label className="label">Prazo de execução (opcional)</label>
                <input type="date" className="input" value={novoPrazo} onChange={e => setNovoPrazo(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">
                  Sugerido a partir do prazo da demanda, mas pode ser ajustado para esta atividade específica.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={novoAnexoObrigatorio} onChange={e => setNovoAnexoObrigatorio(e.target.checked)} className="w-3.5 h-3.5" />
                Anexo obrigatório para finalizar esta atividade
              </label>
              <div className="flex gap-2">
                <button onClick={() => setShowNovaAtividade(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
                <button
                  onClick={() => novoTitulo.trim() && novaEquipe && createAtividade.mutate()}
                  disabled={!novoTitulo.trim() || !novaEquipe || createAtividade.isPending}
                  className="btn-primary flex-1 justify-center text-xs"
                >
                  Atribuir
                </button>
              </div>
            </div>
          )}

          {demanda.atividades.length === 0 && !showNovaAtividade && (
            <div className="card text-center py-8 text-gray-400">Nenhuma atividade criada ainda</div>
          )}

          {demanda.atividades.map(a => {
            const done = a.passos.filter(p => p.concluido).length
            const total = a.passos.length
            const ativa = ['ATRIBUIDA', 'EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO', 'REABERTA'].includes(a.status)
            const atrasada = ativa && a.prazo && new Date(a.prazo) < new Date()
            return (
              <button key={a.id} onClick={() => setAtividadeAberta(a.id)} className="card w-full text-left hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{a.titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {a.equipe ? `Equipe: ${a.equipe.nome} · ` : ''}Responsável: {a.responsavel?.name || 'não definido'}
                    </p>
                    {a.prazo && (
                      <p className={`text-xs mt-0.5 flex items-center gap-1 ${atrasada ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        <Clock className="w-3 h-3" /> Prazo: {format(new Date(a.prazo), 'dd/MM/yy', { locale: ptBR })}{atrasada ? ' · atrasada' : ''}
                      </p>
                    )}
                    {total > 0 && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <ListChecks className="w-3 h-3" /> {done}/{total} passos concluídos
                      </p>
                    )}
                    {a.tempos && (
                      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        espera: {a.tempos.tempoEspera.texto}
                        {a.tempos.tempoExecucao && ` · execução: ${a.tempos.tempoExecucao.texto}`}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_ATIV_COLOR[a.status]}`}>
                    {STATUS_ATIV_LABEL[a.status]}
                  </span>
                </div>
              </button>
            )
          })}

          {/* Pendências externas */}
          <div className="flex items-center justify-between mt-6">
            <h2 className="font-semibold text-gray-800 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-amber-600" /> Pendências Externas
            </h2>
            <button onClick={() => setShowPendencia(true)} className="btn-secondary text-xs">
              <Plus className="w-3.5 h-3.5" /> Registrar
            </button>
          </div>

          {showPendencia && (
            <div className="card space-y-3">
              <div>
                <label className="label">Órgão / Pessoa</label>
                <input className="input" placeholder="Ex: Seinfra, Patrimônio, Cartório..." value={pOrgao} onChange={e => setPOrgao(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Descrição</label>
                <textarea className="input min-h-16 resize-none" placeholder="O que foi solicitado..." value={pDescricao} onChange={e => setPDescricao(e.target.value)} />
              </div>
              <div>
                <label className="label">Protocolo (opcional)</label>
                <input className="input" value={pProtocolo} onChange={e => setPProtocolo(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowPendencia(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
                <button
                  onClick={() => pOrgao.trim() && pDescricao.trim() && createPendencia.mutate()}
                  disabled={!pOrgao.trim() || !pDescricao.trim() || createPendencia.isPending}
                  className="btn-primary flex-1 justify-center text-xs"
                >
                  Registrar
                </button>
              </div>
            </div>
          )}

          {(demanda.pendenciasExternas || []).length === 0 && !showPendencia ? (
            <p className="text-xs text-gray-400 text-center py-3">Nenhuma pendência externa registrada</p>
          ) : (
            <div className="space-y-2">
              {(demanda.pendenciasExternas || []).map(p => {
                const podeGerenciarPendencia = isMaster || demanda.solicitante.id === user?.id || demanda.atividades.some(isResponsavel)
                if (pendenciaEditando === p.id) {
                  return (
                    <div key={p.id} className="card py-3 space-y-2">
                      <input className="input text-sm" placeholder="Órgão / Pessoa" value={pOrgaoEdicao} onChange={e => setPOrgaoEdicao(e.target.value)} autoFocus />
                      <textarea className="input text-sm min-h-16 resize-none" placeholder="Descrição" value={pDescricaoEdicao} onChange={e => setPDescricaoEdicao(e.target.value)} />
                      <input className="input text-sm" placeholder="Protocolo (opcional)" value={pProtocoloEdicao} onChange={e => setPProtocoloEdicao(e.target.value)} />
                      <div className="flex gap-2">
                        <button onClick={() => setPendenciaEditando(null)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
                        <button
                          onClick={() => pOrgaoEdicao.trim() && pDescricaoEdicao.trim() && editarPendencia.mutate({ id: p.id, orgao: pOrgaoEdicao.trim(), descricao: pDescricaoEdicao.trim(), protocolo: pProtocoloEdicao })}
                          disabled={!pOrgaoEdicao.trim() || !pDescricaoEdicao.trim() || editarPendencia.isPending}
                          className="btn-primary flex-1 justify-center text-xs"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                <div key={p.id} className="card py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.orgao}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{p.descricao}</p>
                      {p.protocolo && <p className="text-xs text-gray-400 mt-0.5">Protocolo: {p.protocolo}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${p.status === 'RESPONDIDA' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {p.status === 'RESPONDIDA' ? 'Respondida' : 'Aguardando'}
                      </span>
                      {podeGerenciarPendencia && (
                        <>
                          <button
                            onClick={() => { setPendenciaEditando(p.id); setPOrgaoEdicao(p.orgao); setPDescricaoEdicao(p.descricao); setPProtocoloEdicao(p.protocolo || '') }}
                            className="text-gray-300 hover:text-primary-600"
                            title="Editar pendência"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => confirm(`Excluir a pendência de "${p.orgao}"?`) && excluirPendencia.mutate(p.id)}
                            className="text-gray-300 hover:text-red-500"
                            title="Excluir pendência"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {p.status !== 'RESPONDIDA' && (
                    <button onClick={() => resolverPendencia.mutate(p.id)} className="text-xs text-primary-600 hover:underline mt-2">
                      Marcar como respondida
                    </button>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-sm text-gray-800 mb-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary-600" /> Linha do tempo
            </h3>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {(demanda.historico || []).map(h => (
                <div key={h.id} className="border-l-2 border-primary-100 pl-3 py-0.5">
                  <p className="text-xs text-gray-700">{h.descricao}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {format(new Date(h.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </p>
                </div>
              ))}
              {(!demanda.historico || demanda.historico.length === 0) && (
                <p className="text-xs text-gray-400 text-center py-4">Sem eventos registrados</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal atividade */}
      {atividadeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1024px] max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-800">{atividadeModal.titulo}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {atividadeModal.equipe ? `Equipe: ${atividadeModal.equipe.nome} · ` : ''}Responsável: {atividadeModal.responsavel?.name || 'não definido'} · Solicitante: {atividadeModal.solicitante.name}
                </p>
                <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_ATIV_COLOR[atividadeModal.status]}`}>
                  {STATUS_ATIV_LABEL[atividadeModal.status]}
                </span>
              </div>
              <button onClick={() => { setAtividadeAberta(null); setShowDevolver(false) }} className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {atividadeModal.status === 'ATRIBUIDA' && isResponsavel(atividadeModal) && (
              <div className="px-5 pt-4">
                <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'EM_ANDAMENTO' })} className="btn-primary w-full justify-center">
                  Iniciar atividade
                </button>
              </div>
            )}

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {!atividadeModal.dataInicio && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Inicie a atividade para poder preencher o checklist, as observações e anexar documentos.
                </p>
              )}
              {atividadeModal.instrucoes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Instruções</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{atividadeModal.instrucoes}</p>
                </div>
              )}

              {atividadeModal.motivoDevolucao && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-orange-700 mb-1">Motivo da última devolução</p>
                  <p className="text-sm text-orange-800">{atividadeModal.motivoDevolucao}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" /> Checklist
                </p>
                {podeEditarCampos(atividadeModal) && (
                  <div className="flex gap-2 mb-2">
                    <input
                      className="input text-sm flex-1"
                      placeholder="Adicionar item ao checklist..."
                      value={novoPasso}
                      onChange={e => setNovoPasso(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && novoPasso.trim() && addPasso.mutate(atividadeModal.id)}
                    />
                    <button
                      onClick={() => novoPasso.trim() && addPasso.mutate(atividadeModal.id)}
                      disabled={!novoPasso.trim()}
                      className="btn-primary text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {atividadeModal.passos.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Nenhum item no checklist</p>
                ) : (
                  <div className="space-y-1.5">
                    {atividadeModal.passos.map(p => (
                      <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${p.concluido ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'} ${!podeEditarCampos(atividadeModal) ? 'opacity-70' : ''}`}>
                        <input
                          type="checkbox"
                          checked={p.concluido}
                          disabled={!podeEditarCampos(atividadeModal)}
                          onChange={e => togglePasso.mutate({ id: p.id, concluido: e.target.checked })}
                          className="w-4 h-4 accent-green-600 flex-shrink-0"
                        />
                        {passoEditando === p.id ? (
                          <>
                            <input
                              className="input text-sm flex-1 py-1"
                              value={textoEdicaoPasso}
                              onChange={e => setTextoEdicaoPasso(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && textoEdicaoPasso.trim() && editarPasso.mutate({ id: p.id, descricao: textoEdicaoPasso.trim() })}
                              autoFocus
                            />
                            <button
                              onClick={() => textoEdicaoPasso.trim() && editarPasso.mutate({ id: p.id, descricao: textoEdicaoPasso.trim() })}
                              disabled={!textoEdicaoPasso.trim()}
                              className="text-green-600 hover:text-green-700 flex-shrink-0"
                              title="Salvar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setPassoEditando(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Cancelar">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className={`flex-1 ${p.concluido ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{p.descricao}</span>
                            {podeEditarCampos(atividadeModal) && (
                              <>
                                <button
                                  onClick={() => { setPassoEditando(p.id); setTextoEdicaoPasso(p.descricao) }}
                                  className="text-gray-300 hover:text-primary-600 flex-shrink-0"
                                  title="Editar item"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => confirm(`Excluir o item "${p.descricao}" do checklist?`) && excluirPasso.mutate(p.id)}
                                  className="text-gray-300 hover:text-red-500 flex-shrink-0"
                                  title="Excluir item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" /> Observações
                </p>
                <textarea
                  className="input text-sm min-h-20 resize-none"
                  placeholder="Registre aqui qualquer informação pertinente sobre esta atividade..."
                  value={observacoesTexto}
                  onChange={e => setObservacoesTexto(e.target.value)}
                  disabled={!podeEditarCampos(atividadeModal)}
                />
                {podeEditarCampos(atividadeModal) && (
                  <button
                    onClick={() => salvarObservacoes.mutate({ atividadeId: atividadeModal.id, observacoes: observacoesTexto })}
                    disabled={salvarObservacoes.isPending || observacoesTexto === (atividadeModal.observacoes || '')}
                    className="btn-secondary text-xs mt-2"
                  >
                    {salvarObservacoes.isPending ? 'Salvando...' : 'Salvar observações'}
                  </button>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Documentos
                </p>
                {podeEditarCampos(atividadeModal) && (
                  <div className="space-y-2 mb-2">
                    <input className="input text-sm" placeholder="Nome do documento (ex: Planta, Memorial...)" value={novoDocNome} onChange={e => setNovoDocNome(e.target.value)} />
                    <div className="flex gap-2">
                      <input className="input text-sm flex-1" placeholder="ou link do Google Drive" value={novoDocLink} onChange={e => setNovoDocLink(e.target.value)} />
                      <button
                        onClick={() => novoDocNome.trim() && novoDocLink.trim() && addDocumento.mutate(atividadeModal.id)}
                        disabled={!novoDocNome.trim() || !novoDocLink.trim()}
                        className="btn-secondary text-xs whitespace-nowrap"
                      >
                        Anexar link
                      </button>
                    </div>
                    <label className="btn-primary text-xs w-full justify-center cursor-pointer">
                      <Plus className="w-3.5 h-3.5" /> Enviar arquivo (PDF, DOC, XLS, imagem, DWG...)
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg,.zip"
                        onChange={e => {
                          const arquivo = e.target.files?.[0]
                          if (arquivo) uploadDocumento.mutate({ atividadeId: atividadeModal.id, arquivo })
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {uploadDocumento.isPending && <p className="text-xs text-gray-400 text-center">Enviando...</p>}
                  </div>
                )}
                {atividadeModal.documentos.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Nenhum documento anexado</p>
                ) : (
                  <div className="space-y-1.5">
                    {atividadeModal.documentos.map(d => (
                      <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50 group">
                        {d.arquivoPath ? (
                          <button onClick={() => baixarArquivo(d.id, d.nome)} className="flex-1 flex items-center gap-2 text-sm text-primary-700 hover:underline min-w-0 text-left">
                            <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{d.nome}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">v{d.versao}</span>
                          </button>
                        ) : (
                          <a href={d.linkDrive} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center gap-2 text-sm text-primary-700 hover:underline min-w-0">
                            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{d.nome}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">v{d.versao}</span>
                          </a>
                        )}
                        {d.arquivoPath && d.arquivoHash && (
                          <button
                            onClick={() => verificarIntegridade(d.id)}
                            title="Verificar integridade do arquivo (hash SHA-256)"
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-green-600 transition-all flex-shrink-0"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {podeEditarCampos(atividadeModal) && (
                          <button onClick={() => deleteDocumento.mutate(d.id)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 space-y-2">
              {atividadeModal.status === 'AGUARDANDO_INFORMACAO' && isResponsavel(atividadeModal) && (
                <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'EM_ANDAMENTO' })} className="btn-primary w-full justify-center">
                  Retomar atividade
                </button>
              )}
              {atividadeModal.status === 'EM_ANDAMENTO' && isResponsavel(atividadeModal) && !showFinalizar && (
                <div className="flex gap-2">
                  <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'AGUARDANDO_INFORMACAO' })} className="btn-secondary text-xs">
                    Aguardar informação
                  </button>
                  <button onClick={() => { setInfoFinalizacao(''); setShowFinalizar(true) }} className="btn-primary flex-1 justify-center">
                    <CheckCircle2 className="w-4 h-4" /> Finalizar tarefa
                  </button>
                </div>
              )}
              {['EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO', 'DEVOLVIDA', 'REABERTA'].includes(atividadeModal.status) && isResponsavel(atividadeModal) && !showFinalizar && (
                <button onClick={() => setShowTransferir(true)} className="btn-secondary w-full justify-center text-xs">
                  <Repeat className="w-3.5 h-3.5" /> Transferir tarefa
                </button>
              )}
              {atividadeModal.status === 'CONCLUIDA' && isSolicitante(atividadeModal) && !showDevolver && (
                <div className="flex gap-2">
                  <button onClick={() => setShowDevolver(true)} className="btn-secondary flex-1 justify-center">Devolver para correção</button>
                  <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'APROVADA' })} className="btn-primary flex-1 justify-center">
                    Aprovar
                  </button>
                </div>
              )}
              {showDevolver && (
                <div className="space-y-2">
                  <textarea
                    className="input text-sm min-h-16 resize-none"
                    placeholder="Motivo da devolução (obrigatório)..."
                    value={devolverMotivo}
                    onChange={e => setDevolverMotivo(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowDevolver(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
                    <button
                      onClick={() => devolverMotivo.trim() && statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'DEVOLVIDA', motivo: devolverMotivo.trim() })}
                      disabled={!devolverMotivo.trim()}
                      className="btn-primary flex-1 justify-center text-xs"
                    >
                      Confirmar devolução
                    </button>
                  </div>
                </div>
              )}
              {atividadeModal.status === 'APROVADA' && !showReabrir && (
                <div className="space-y-2">
                  <p className="text-center text-sm text-green-600 font-medium flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Atividade aprovada
                  </p>
                  {isSolicitante(atividadeModal) && (
                    <button onClick={() => setShowReabrir(true)} className="btn-secondary w-full justify-center text-xs">
                      <RotateCcw className="w-3.5 h-3.5" /> Reabrir
                    </button>
                  )}
                </div>
              )}
              {showReabrir && (
                <div className="space-y-2">
                  <textarea
                    className="input text-sm min-h-16 resize-none"
                    placeholder="Justificativa da reabertura (obrigatória)..."
                    value={motivoReabrir}
                    onChange={e => setMotivoReabrir(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowReabrir(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
                    <button
                      onClick={() => motivoReabrir.trim() && statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'REABERTA', motivo: motivoReabrir.trim() })}
                      disabled={!motivoReabrir.trim()}
                      className="btn-primary flex-1 justify-center text-xs"
                    >
                      Confirmar reabertura
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de transferência (Bloco 3: só entre usuários ativos da mesma equipe) */}
      {showTransferir && atividadeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Transferir tarefa</h2>
              <button onClick={() => setShowTransferir(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label">Novo responsável (mesma equipe) *</label>
                <select className="input" value={novoResponsavelTransfer} onChange={e => setNovoResponsavelTransfer(e.target.value)} autoFocus>
                  <option value="">Selecione...</option>
                  {usuarios
                    .filter(u => u.active && u.id !== atividadeModal.responsavel?.id)
                    .filter(u => !atividadeModal.equipe || equipes.find(e => e.id === atividadeModal.equipe!.id)?.membros.some(m => m.user.id === u.id))
                    .map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Justificativa *</label>
                <textarea className="input min-h-16 resize-none" placeholder="Por que esta tarefa não é de sua competência..." value={justificativaTransfer} onChange={e => setJustificativaTransfer(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowTransferir(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button
                onClick={() => novoResponsavelTransfer && justificativaTransfer.trim() && transferirAtividade.mutate({ atividadeId: atividadeModal.id, novoResponsavelId: novoResponsavelTransfer, justificativa: justificativaTransfer.trim() })}
                disabled={!novoResponsavelTransfer || !justificativaTransfer.trim() || transferirAtividade.isPending}
                className="btn-primary flex-1 justify-center"
              >
                Transferir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de finalização (Bloco 5): texto obrigatório fixo definido pela especificação */}
      {showFinalizar && atividadeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Finalizar tarefa</h2>
              <button onClick={() => setShowFinalizar(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <p className="text-sm font-medium text-gray-800">Adicione as informações das solicitações atendidas no GEP.</p>
              <div>
                <label className="label">Informações das solicitações atendidas no GEP *</label>
                <textarea
                  className="input min-h-24 resize-none"
                  placeholder="Descreva o que foi realizado..."
                  value={infoFinalizacao}
                  onChange={e => setInfoFinalizacao(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Documentos anexados</p>
                {atividadeModal.documentos.length === 0 ? (
                  <p className={`text-xs text-center py-2 rounded-lg ${atividadeModal.anexoObrigatorio ? 'bg-red-50 text-red-600' : 'text-gray-400'}`}>
                    {atividadeModal.anexoObrigatorio ? 'Esta atividade exige ao menos um documento anexado antes de finalizar' : 'Nenhum documento anexado'}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {atividadeModal.documentos.map(d => (
                      <p key={d.id} className="text-xs text-gray-600 flex items-center gap-1.5"><FileText className="w-3 h-3" /> {d.nome}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-gray-500">Resumo</p>
                <p className="text-xs text-gray-600">GEP {demanda.gepNumero}/{demanda.gepAno} — {demanda.assunto}</p>
                {atividadeModal.instrucoes && <p className="text-xs text-gray-600">Solicitação: {atividadeModal.instrucoes}</p>}
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowFinalizar(false)} className="btn-secondary flex-1 justify-center">Voltar</button>
              <button
                onClick={() => infoFinalizacao.trim() && statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'CONCLUIDA', informacoesFinalizacao: infoFinalizacao.trim() })}
                disabled={!infoFinalizacao.trim() || (atividadeModal.anexoObrigatorio && atividadeModal.documentos.length === 0) || statusAtividade.isPending}
                className="btn-primary flex-1 justify-center"
              >
                Confirmar finalização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
