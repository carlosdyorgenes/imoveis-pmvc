'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Demanda, Atividade, StatusAtividade, StatusDemanda, User, Equipe, Prioridade } from '@/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X, CheckCircle2, ListChecks, Clock, FileText, Building2, ExternalLink, Trash2, AlertTriangle, ShieldCheck, Repeat, RotateCcw, ArrowUp, Minus, ArrowDown, Pencil, Check, StickyNote, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/hooks/useAuth'
import dynamic from 'next/dynamic'

// Tiptap é pesado (~130kB) — carrega só quando o modal de atividade (que tem o campo de
// observações) realmente abre, em vez de inflar o carregamento inicial desta página.
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor').then(m => m.RichTextEditor), {
  ssr: false,
  loading: () => <div className="border border-gray-200 rounded-lg min-h-32 bg-gray-50 animate-pulse" />,
})

const errMsg = (err: any, fallback: string) => err?.response?.data?.error || fallback

// Anexo por link do Google Drive (campos "Nome do documento" e "link do Google Drive") está
// fora de uso no momento — oculto na tela sem remover o código/mutation, pra reativar rápido
// se precisar de novo.
const ANEXAR_LINK_DRIVE_VISIVEL = false

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

const STATUS_DEMANDA_LABEL: Record<StatusDemanda, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  PARCIALMENTE_CONCLUIDA: 'Parcialmente concluída',
  AGUARDANDO_TERCEIRO: 'Aguardando terceiro',
  DEVOLVIDA: 'Devolvida',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
}

const STATUS_DEMANDA_COLOR: Record<StatusDemanda, string> = {
  ABERTA: 'bg-gray-100 text-gray-600',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  PARCIALMENTE_CONCLUIDA: 'bg-indigo-100 text-indigo-700',
  AGUARDANDO_TERCEIRO: 'bg-amber-100 text-amber-700',
  DEVOLVIDA: 'bg-orange-100 text-orange-700',
  CONCLUIDA: 'bg-green-100 text-green-700',
  CANCELADA: 'bg-red-100 text-red-700',
}

// Observações agora são digitadas no editor de texto rico e ficam salvas como HTML — pro
// resumo estruturado (texto puro, base do que vai pra IA) precisamos só do conteúdo legível,
// sem as tags de formatação.
function htmlParaTexto(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

// Monta um texto formal, pronto pra reportar, com a situação atual de cada atividade da
// demanda — usado pelo botão "Resumo da demanda" (Master). Determinístico: não usa IA, só
// formata os dados já carregados, então o texto é sempre consistente com o que está na tela.
function gerarResumoDemanda(demanda: Demanda, autor: string): string {
  const dataHora = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const dataCurta = (iso: string) => format(new Date(iso), 'dd/MM/yyyy', { locale: ptBR })

  const linhas: string[] = []
  linhas.push(`RESUMO DA DEMANDA — GEP ${demanda.gepNumero}/${demanda.gepAno}`)
  linhas.push('')
  linhas.push(`Assunto: ${demanda.assunto}`)
  if (demanda.interessado) linhas.push(`Interessado: ${demanda.interessado}`)
  linhas.push(`Solicitante: ${demanda.solicitante.name}`)
  linhas.push(`Status geral: ${STATUS_DEMANDA_LABEL[demanda.status]}`)
  linhas.push(`Prioridade: ${PRIORIDADE_LABEL[demanda.prioridade]}`)
  linhas.push(`Prazo geral: ${demanda.prazo ? dataCurta(demanda.prazo) : 'não definido'}`)
  linhas.push(`Aberta em: ${dataCurta(demanda.createdAt)}`)
  linhas.push('')

  const atividades = demanda.atividades.filter(a => a.status !== 'CANCELADA')
  linhas.push(`SITUAÇÃO DAS ATIVIDADES (${atividades.length})`)
  linhas.push('')

  if (atividades.length === 0) {
    linhas.push('Nenhuma atividade cadastrada até o momento.')
  }

  atividades.forEach((a, i) => {
    const atrasada = a.prazo && new Date(a.prazo) < new Date() && !['CONCLUIDA', 'APROVADA'].includes(a.status)
    linhas.push(`${i + 1}. ${a.titulo}`)
    linhas.push(`   Equipe: ${a.equipe?.nome || 'não definida'} | Responsável: ${a.responsavel?.name || 'não definido'}`)
    linhas.push(`   Status: ${STATUS_ATIV_LABEL[a.status]} | Prioridade: ${PRIORIDADE_LABEL[a.prioridade]}`)
    linhas.push(`   Prazo: ${a.prazo ? dataCurta(a.prazo) : 'não definido'}${atrasada ? ' (em atraso)' : ''}`)
    if (a.tempos) {
      linhas.push(`   Tempo em espera: ${a.tempos.tempoEspera.texto} | Tempo em execução: ${a.tempos.tempoExecucao?.texto || 'atividade não iniciada'}`)
    }
    const pendencias = (demanda.pendenciasExternas || []).filter(p => p.atividadeId === a.id && p.status !== 'RESPONDIDA')
    if (pendencias.length > 0) {
      linhas.push(`   Pendência(s) externa(s) em aberto: ${pendencias.map(p => `${p.orgao} (${p.descricao})`).join('; ')}`)
    }
    if (a.status === 'DEVOLVIDA' && a.motivoDevolucao) {
      linhas.push(`   Motivo da devolução: ${a.motivoDevolucao}`)
    }
    const observacoesTexto = a.observacoes ? htmlParaTexto(a.observacoes) : ''
    if (observacoesTexto) {
      linhas.push(`   Observações: ${observacoesTexto}`)
    }
    linhas.push('')
  })

  linhas.push(`Relatório gerado em ${dataHora(new Date().toISOString())} por ${autor}.`)

  return linhas.join('\n')
}

// Espelha o mesmo critério de "envolvido" usado na visibilidade individual: responsável
// direto, ou fallback por equipe só quando a atividade não tem responsável definido. Um setor
// cuja atividade já foi aprovada, sem nova pendência atribuída a ele, vê a demanda como
// Concluída mesmo que ela siga em andamento em outro setor.
function statusPercebido(d: Demanda, isMaster: boolean, userId: string | undefined, equipes: Equipe[]): StatusDemanda {
  if (isMaster || !userId) return d.status
  if (['CONCLUIDA', 'CANCELADA'].includes(d.status)) return d.status
  const minhasEquipeIds = equipes.filter(e => e.membros.some(m => m.user.id === userId)).map(e => e.id)
  const minhasAtividades = d.atividades.filter(a =>
    a.responsavel?.id === userId || (a.equipe && minhasEquipeIds.includes(a.equipe.id))
  )
  if (minhasAtividades.length === 0) return d.status
  const meuSetorConcluido = minhasAtividades.every(a => ['APROVADA', 'CANCELADA'].includes(a.status))
  return meuSetorConcluido ? 'CONCLUIDA' : d.status
}

export default function DemandaDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const qc = useQueryClient()
  const router = useRouter()
  const { user, isMaster } = useAuth()

  const [showDescricao, setShowDescricao] = useState(false)
  const [showEditarDemanda, setShowEditarDemanda] = useState(false)
  const [editDemandaAssunto, setEditDemandaAssunto] = useState('')
  const [editDemandaDescricao, setEditDemandaDescricao] = useState('')
  const [editDemandaInteressado, setEditDemandaInteressado] = useState('')
  const [editDemandaPrazo, setEditDemandaPrazo] = useState('')
  const [editDemandaPrioridade, setEditDemandaPrioridade] = useState<Prioridade>('MEDIA')
  const [showResumo, setShowResumo] = useState(false)
  const [atualizandoResumo, setAtualizandoResumo] = useState(false)
  const [comparacaoResumo, setComparacaoResumo] = useState<'houve' | 'nao-houve' | 'primeira' | null>(null)
  const [textoResumoIA, setTextoResumoIA] = useState('')
  const [provedorResumoIA, setProvedorResumoIA] = useState<'claude' | 'openai' | null>(null)
  const [modoProsaIA, setModoProsaIA] = useState(false)
  const [showNovaAtividade, setShowNovaAtividade] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaEquipe, setNovaEquipe] = useState('')
  const [novoResponsavel, setNovoResponsavel] = useState('')
  const [novasInstrucoes, setNovasInstrucoes] = useState('')
  const [novoAnexoObrigatorio, setNovoAnexoObrigatorio] = useState(false)
  const [novoPrazo, setNovoPrazo] = useState('')
  const [novaPrioridade, setNovaPrioridade] = useState<Prioridade>('MEDIA')

  const [atividadeAberta, setAtividadeAberta] = useState<string | null>(null)
  const [novoPasso, setNovoPasso] = useState('')
  const [passoEditando, setPassoEditando] = useState<string | null>(null)
  const [textoEdicaoPasso, setTextoEdicaoPasso] = useState('')
  const [devolverMotivo, setDevolverMotivo] = useState('')
  const [showDevolver, setShowDevolver] = useState(false)
  const [novoDocNome, setNovoDocNome] = useState('')
  const [novoDocLink, setNovoDocLink] = useState('')

  const [showFinalizar, setShowFinalizar] = useState(false)

  const [showTransferir, setShowTransferir] = useState(false)
  const [novoResponsavelTransfer, setNovoResponsavelTransfer] = useState('')
  const [justificativaTransfer, setJustificativaTransfer] = useState('')

  const [showEncerrarAtividade, setShowEncerrarAtividade] = useState(false)
  const [motivoEncerrar, setMotivoEncerrar] = useState('')

  const [showEditarAtividade, setShowEditarAtividade] = useState(false)
  const [editTitulo, setEditTitulo] = useState('')
  const [editInstrucoes, setEditInstrucoes] = useState('')
  const [editPrazo, setEditPrazo] = useState('')
  const [editPrioridade, setEditPrioridade] = useState<Prioridade>('MEDIA')
  const [editAnexoObrigatorio, setEditAnexoObrigatorio] = useState(false)

  const [observacoesTexto, setObservacoesTexto] = useState('')

  const [showReabrir, setShowReabrir] = useState(false)
  const [motivoReabrir, setMotivoReabrir] = useState('')

  const [showPendencia, setShowPendencia] = useState(false)
  const [pOrgao, setPOrgao] = useState('')
  const [pDescricao, setPDescricao] = useState('')
  const [pProtocolo, setPProtocolo] = useState('')
  const [pPrazoEsperado, setPPrazoEsperado] = useState('')

  const [pendenciaEditando, setPendenciaEditando] = useState<string | null>(null)
  const [pOrgaoEdicao, setPOrgaoEdicao] = useState('')
  const [pDescricaoEdicao, setPDescricaoEdicao] = useState('')
  const [pProtocoloEdicao, setPProtocoloEdicao] = useState('')
  const [pPrazoEsperadoEdicao, setPPrazoEsperadoEdicao] = useState('')

  const { data: demanda, isLoading, isError, error: demandaError, refetch: refetchDemanda } = useQuery<Demanda>({
    queryKey: ['demanda', id],
    queryFn: () => api.get(`/api/demandas/${id}`).then(r => r.data),
    // Sem retry: se a atividade foi transferida (ou o acesso mudou) desde a última vez que
    // essa demanda foi carregada, o React Query por padrão mantém os dados antigos em cache
    // visíveis mesmo quando o refetch falha com 403 — isso deixava quem perdeu acesso ainda
    // vendo a demanda ao clicar numa notificação antiga. Tratar o erro explicitamente abaixo
    // evita esse vazamento de dado em cache.
    retry: false,
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

  const editarDemanda = useMutation({
    mutationFn: () => api.put(`/api/demandas/${id}`, {
      assunto: editDemandaAssunto,
      descricao: editDemandaDescricao,
      interessado: editDemandaInteressado,
      prazo: editDemandaPrazo || null,
      prioridade: editDemandaPrioridade,
    }),
    onSuccess: () => { invalidar(); setShowEditarDemanda(false); toast.success('Demanda atualizada') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao editar demanda'))
  })

  const deleteDemanda = useMutation({
    mutationFn: () => api.delete(`/api/demandas/${id}`),
    onSuccess: () => { toast.success('Demanda excluída'); router.push('/demandas') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao excluir demanda'))
  })

  const excluirAtividade = useMutation({
    mutationFn: (atividadeId: string) => api.delete(`/api/demandas/atividades/${atividadeId}`),
    onSuccess: () => { invalidar(); setAtividadeAberta(null); toast.success('Atividade excluída') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao excluir atividade'))
  })

  const gerarResumoIA = useMutation({
    mutationFn: (texto: string) => api.post(`/api/demandas/${id}/resumo-formal`, { texto }).then(r => r.data as { texto: string; provedor: 'claude' | 'openai' }),
    onSuccess: ({ texto, provedor }) => {
      setTextoResumoIA(texto); setProvedorResumoIA(provedor); setModoProsaIA(true)
      if (provedor === 'openai') toast('Gerado pela IA alternativa (ChatGPT) — a Claude API não respondeu', { icon: 'ℹ️' })
    },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao gerar texto com IA'))
  })

  const createAtividade = useMutation({
    mutationFn: () => api.post(`/api/demandas/${id}/atividades`, {
      titulo: novoTitulo,
      instrucoes: novasInstrucoes,
      equipeId: novaEquipe,
      anexoObrigatorio: novoAnexoObrigatorio,
      prazo: novoPrazo || null,
      prioridade: novaPrioridade,
      responsavelId: novoResponsavel || undefined,
    }),
    onSuccess: (res) => {
      invalidar()
      toast.success(`Atividade atribuída a ${res.data.responsavel?.name || 'um membro da equipe'}`)
      setShowNovaAtividade(false); setNovoTitulo(''); setNovaEquipe(''); setNovoResponsavel(''); setNovasInstrucoes(''); setNovoAnexoObrigatorio(false); setNovoPrazo(''); setNovaPrioridade('MEDIA')
    },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao criar atividade'))
  })

  const statusAtividade = useMutation({
    mutationFn: ({ atividadeId, status, motivo, informacoesFinalizacao }: { atividadeId: string; status: string; motivo?: string; informacoesFinalizacao?: string }) =>
      api.put(`/api/demandas/atividades/${atividadeId}/status`, { status, motivo, informacoesFinalizacao }),
    onSuccess: () => {
      invalidar(); toast.success('Atividade atualizada')
      setShowDevolver(false); setDevolverMotivo('')
      setShowFinalizar(false)
      setShowReabrir(false); setMotivoReabrir('')
      setShowEncerrarAtividade(false); setMotivoEncerrar('')
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

  const editarAtividade = useMutation({
    mutationFn: (atividadeId: string) => api.put(`/api/demandas/atividades/${atividadeId}`, {
      titulo: editTitulo,
      instrucoes: editInstrucoes,
      prazo: editPrazo || null,
      prioridade: editPrioridade,
      anexoObrigatorio: editAnexoObrigatorio,
    }),
    onSuccess: () => { invalidar(); setShowEditarAtividade(false); toast.success('Atividade atualizada') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao editar atividade'))
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

  const [baixandoZip, setBaixandoZip] = useState(false)
  const baixarTodosZip = async (atividadeId: string, tituloAtividade: string) => {
    setBaixandoZip(true)
    try {
      const res = await api.get(`/api/demandas/atividades/${atividadeId}/documentos/zip`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = `documentos-${tituloAtividade}.zip`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao baixar arquivos (verifique se há algum arquivo enviado nesta atividade)')
    } finally {
      setBaixandoZip(false)
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
    mutationFn: (atividadeId: string) => api.post(`/api/demandas/atividades/${atividadeId}/pendencias`, { orgao: pOrgao, descricao: pDescricao, protocolo: pProtocolo, prazoEsperado: pPrazoEsperado || null }),
    onSuccess: () => { invalidar(); setShowPendencia(false); setPOrgao(''); setPDescricao(''); setPProtocolo(''); setPPrazoEsperado(''); toast.success('Pendência externa registrada') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao registrar pendência'))
  })

  const resolverPendencia = useMutation({
    mutationFn: (pendId: string) => api.put(`/api/demandas/pendencias/${pendId}`, { status: 'RESPONDIDA' }),
    onSuccess: () => { invalidar(); toast.success('Pendência marcada como respondida') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao atualizar pendência'))
  })

  const editarPendencia = useMutation({
    mutationFn: ({ id, orgao, descricao, protocolo, prazoEsperado }: { id: string; orgao: string; descricao: string; protocolo: string; prazoEsperado: string }) =>
      api.put(`/api/demandas/pendencias/${id}`, { orgao, descricao, protocolo, prazoEsperado: prazoEsperado || null }),
    onSuccess: () => { invalidar(); setPendenciaEditando(null); toast.success('Pendência atualizada') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao editar pendência'))
  })

  const excluirPendencia = useMutation({
    mutationFn: (id: string) => api.delete(`/api/demandas/pendencias/${id}`),
    onSuccess: () => { invalidar(); toast.success('Pendência removida') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao excluir pendência'))
  })


  // Só reidrata o texto quando o modal troca de atividade (ou abre) — nunca em resposta a um
  // refetch em segundo plano do React Query (ex.: ao voltar de minimizar a aba), que senão
  // sobrescrevia silenciosamente o que o usuário tinha digitado e ainda não salvou.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const a = demanda?.atividades.find(a => a.id === atividadeAberta)
    setObservacoesTexto(a?.observacoes || '')
  }, [atividadeAberta])

  const salvarObservacoes = useMutation({
    mutationFn: ({ atividadeId, observacoes }: { atividadeId: string; observacoes: string }) =>
      api.put(`/api/demandas/atividades/${atividadeId}/observacoes`, { observacoes }),
    onSuccess: () => { invalidar(); toast.success('Observações salvas') },
    onError: (e: any) => toast.error(errMsg(e, 'Erro ao salvar observações'))
  })

  if (isLoading) return <div className="p-8 text-center text-gray-400">Carregando...</div>
  if (isError) {
    const status = (demandaError as any)?.response?.status
    return (
      <div className="p-8 text-center text-gray-400">
        {status === 403
          ? 'Você não tem mais acesso a esta demanda — provavelmente a atividade que você tinha aqui foi transferida para outra pessoa.'
          : 'Não foi possível carregar esta demanda.'}
      </div>
    )
  }
  if (!demanda) return <div className="p-8 text-center text-gray-400">Demanda não encontrada</div>

  const atividadeModal = demanda.atividades.find(a => a.id === atividadeAberta) || null
  // Só o responsável específico atribuído pela distribuição automática age na atividade — um
  // colega da mesma equipe que não foi o escolhido não é "responsável" (equipe só entra como
  // fallback no caso raro de a atividade não ter nenhum responsável individual definido).
  // Qualquer membro da mesma equipe pode agir na atividade, não só quem foi escolhido pela
  // distribuição automática — mesma regra do backend (ver domain/visibilidade.ts).
  const isResponsavelUsuario = (a: Atividade) => a.responsavel?.id === user?.id
  const isMembroEquipe = (a: Atividade) => !!a.equipe && !!equipes.find(e => e.id === a.equipe!.id)?.membros.some(m => m.user.id === user?.id)
  const isResponsavel = (a: Atividade) => isResponsavelUsuario(a) || isMembroEquipe(a)
  const isSolicitante = (a: Atividade) => a.solicitante.id === user?.id
  const podeGerenciarChecklist = (a: Atividade) => isMaster || isResponsavel(a) || isSolicitante(a)
  // Checklist, observações e documentos só ficam liberados depois que a atividade foi
  // iniciada ao menos uma vez (dataInicio preenchida) — antes disso, tudo fica bloqueado.
  const podeEditarCampos = (a: Atividade) => podeGerenciarChecklist(a) && !!a.dataInicio
  // Documentos: Master pode anexar mesmo antes da atividade ter sido iniciada — o bloqueio por
  // dataInicio existe pra impedir responsável/solicitante de mexer numa atividade parada, mas
  // não faz sentido pro Master, que precisa poder complementar documentação a qualquer momento.
  const podeAnexarDocumento = (a: Atividade) => isMaster || podeEditarCampos(a)

  const statusExibido = statusPercebido(demanda, isMaster, user?.id, equipes)

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
            <span className={`text-xs px-2 py-0.5 rounded-full font-sans font-medium ${STATUS_DEMANDA_COLOR[statusExibido]}`}>
              {STATUS_DEMANDA_LABEL[statusExibido]}
            </span>
            {demanda.prazo && new Date(demanda.prazo) < new Date() && !['CONCLUIDA', 'CANCELADA'].includes(demanda.status) && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-sans font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Atrasada
              </span>
            )}
          </h1>
          <p className="text-gray-500 text-sm">
            {demanda.assunto}{demanda.interessado ? ` — ${demanda.interessado}` : ''}
            {demanda.prazo && <span className="ml-2 text-xs text-gray-400">Prazo: {format(new Date(demanda.prazo), 'dd/MM/yy', { locale: ptBR })}</span>}
            {demanda.descricao && (
              <button onClick={() => setShowDescricao(true)} className="ml-2 text-xs text-primary-600 hover:underline">
                Ver descrição
              </button>
            )}
          </p>
        </div>
        {(isMaster || demanda.solicitante.id === user?.id) && (
          <button
            onClick={() => {
              setEditDemandaAssunto(demanda.assunto)
              setEditDemandaDescricao(demanda.descricao || '')
              setEditDemandaInteressado(demanda.interessado || '')
              setEditDemandaPrazo(demanda.prazo ? demanda.prazo.slice(0, 10) : '')
              setEditDemandaPrioridade(demanda.prioridade)
              setShowEditarDemanda(true)
            }}
            className="ml-auto btn-secondary text-xs"
          >
            <Pencil className="w-3.5 h-3.5" /> Editar Demanda
          </button>
        )}
        {isMaster && (
          <button
            onClick={() => confirm(`Excluir definitivamente a demanda GEP ${demanda.gepNumero}/${demanda.gepAno}?\n\nIsso apaga também todas as atividades, checklist, documentos e histórico relacionados. Esta ação não pode ser desfeita.`) && deleteDemanda.mutate()}
            className="btn-danger text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" /> Excluir Demanda
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Atividades</h2>
            <div className="flex gap-2">
              {isMaster && (
                <button
                  onClick={async () => {
                    // Busca a demanda de novo antes de montar o resumo — sem isso, o texto
                    // poderia refletir dados de quando a página foi carregada, não o estado
                    // real das atividades no momento em que o Master pede o resumo.
                    setAtualizandoResumo(true)
                    try {
                      await refetchDemanda()
                      // Comparação calculada e guardada no servidor (por usuário + demanda),
                      // não no navegador — assim funciona igual em qualquer computador que o
                      // Master use, não só no dispositivo onde consultou da última vez.
                      const res = await api.post(`/api/demandas/${id}/resumo-consulta`)
                      setComparacaoResumo(res.data.comparacao)
                      // Nada mudou desde a última vez: reaproveita o texto em prosa já gerado
                      // (evita gasto novo com IA e permite reconsultar o mesmo texto de antes).
                      if (res.data.textoProsaIA) {
                        setTextoResumoIA(res.data.textoProsaIA)
                        setProvedorResumoIA(res.data.provedorProsaIA || null)
                        setModoProsaIA(true)
                      }
                    } finally {
                      setAtualizandoResumo(false)
                    }
                    setShowResumo(true)
                  }}
                  disabled={atualizandoResumo}
                  className="btn-secondary text-xs"
                >
                  <FileText className="w-3.5 h-3.5" /> {atualizandoResumo ? 'Atualizando...' : 'Resumo da demanda'}
                </button>
              )}
              {(isMaster || demanda.solicitante.id === user?.id) && (
                <button onClick={() => { setNovoPrazo(demanda.prazo ? demanda.prazo.slice(0, 10) : ''); setNovaPrioridade(demanda.prioridade); setShowNovaAtividade(true) }} className="btn-primary text-xs">
                  <Plus className="w-3.5 h-3.5" /> Nova Atividade
                </button>
              )}
            </div>
          </div>

          {showNovaAtividade && (
            <div className="card space-y-3">
              <div>
                <label className="label">Título da atividade</label>
                <input className="input" placeholder="Ex: Elaborar parecer jurídico" value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Equipe responsável</label>
                <select className="input" value={novaEquipe} onChange={e => { setNovaEquipe(e.target.value); setNovoResponsavel('') }}>
                  <option value="">Selecione a equipe...</option>
                  {equipes.filter(e => e.ativo).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Por padrão, a atividade é atribuída automaticamente a quem, na equipe, tiver menos atividades em aberto no momento.
                </p>
              </div>
              {novaEquipe && (
                <div>
                  <label className="label">Usuário responsável (opcional)</label>
                  <select className="input" value={novoResponsavel} onChange={e => setNovoResponsavel(e.target.value)}>
                    <option value="">Distribuição automática (menor carga)</option>
                    {equipes.find(e => e.id === novaEquipe)?.membros
                      .filter(m => m.user.active)
                      .map(m => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Deixe em "Distribuição automática" para o sistema escolher, ou selecione manualmente um membro específico da equipe.
                  </p>
                </div>
              )}
              <div>
                <label className="label">Instruções / solicitação específica</label>
                <textarea className="input min-h-16 resize-none" placeholder="O que deve ser feito, qual resultado é esperado..." value={novasInstrucoes} onChange={e => setNovasInstrucoes(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Prazo de execução (opcional)</label>
                  <input type="date" className="input" value={novoPrazo} onChange={e => setNovoPrazo(e.target.value)} />
                </div>
                <div>
                  <label className="label">Prioridade da atividade</label>
                  <select className="input" value={novaPrioridade} onChange={e => setNovaPrioridade(e.target.value as Prioridade)}>
                    {Object.entries(PRIORIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-1">
                Sugeridos a partir da demanda, mas podem ser ajustados para esta atividade específica — uma demanda Média pode ter uma atividade pontualmente Alta.
              </p>
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
                    <p className="font-medium text-gray-800 text-sm truncate flex items-center gap-1.5">
                      {a.titulo}
                      {(() => { const Icone = PRIORIDADE_ICONE[a.prioridade]; return (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 flex-shrink-0 ${PRIORIDADE_COLOR[a.prioridade]}`}>
                          <Icone className="w-2.5 h-2.5" /> {PRIORIDADE_LABEL[a.prioridade]}
                        </span>
                      )})()}
                    </p>
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

          {(() => {
            // Pendências antigas, registradas antes da mudança que passou a exigir uma
            // atividade vinculada — mantidas visíveis aqui pra não sumir dado real, mas sem
            // opção de criar novas assim (toda pendência nova nasce dentro de uma atividade).
            const legado = (demanda.pendenciasExternas || []).filter(p => !p.atividadeId)
            if (legado.length === 0) return null
            return (
              <div className="mt-6">
                <h2 className="font-semibold text-gray-800 flex items-center gap-1.5 mb-2">
                  <Building2 className="w-4 h-4 text-amber-600" /> Pendências externas (sem atividade vinculada)
                </h2>
                <div className="space-y-2">
                  {legado.map(p => (
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
                          {(isMaster || demanda.solicitante.id === user?.id) && (
                            <button
                              onClick={() => confirm(`Excluir a pendência de "${p.orgao}"?`) && excluirPendencia.mutate(p.id)}
                              className="text-gray-300 hover:text-red-500"
                              title="Excluir pendência"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {p.status !== 'RESPONDIDA' && (
                        <button onClick={() => resolverPendencia.mutate(p.id)} className="text-xs text-primary-600 hover:underline mt-2">
                          Marcar como respondida
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
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
                <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                  {atividadeModal.titulo}
                  {(() => { const Icone = PRIORIDADE_ICONE[atividadeModal.prioridade]; return (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${PRIORIDADE_COLOR[atividadeModal.prioridade]}`}>
                      <Icone className="w-2.5 h-2.5" /> {PRIORIDADE_LABEL[atividadeModal.prioridade]}
                    </span>
                  )})()}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {atividadeModal.equipe ? `Equipe: ${atividadeModal.equipe.nome} · ` : ''}Responsável: {atividadeModal.responsavel?.name || 'não definido'} · Solicitante: {atividadeModal.solicitante.name}
                </p>
                <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_ATIV_COLOR[atividadeModal.status]}`}>
                  {STATUS_ATIV_LABEL[atividadeModal.status]}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {isMaster && (
                  <button
                    onClick={() => {
                      setEditTitulo(atividadeModal.titulo)
                      setEditInstrucoes(atividadeModal.instrucoes || '')
                      setEditPrazo(atividadeModal.prazo ? atividadeModal.prazo.slice(0, 10) : '')
                      setEditPrioridade(atividadeModal.prioridade)
                      setEditAnexoObrigatorio(atividadeModal.anexoObrigatorio)
                      setShowEditarAtividade(true)
                    }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-primary-600"
                    title="Editar atividade"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {isMaster && (
                  <button
                    onClick={() => confirm(`Excluir definitivamente a atividade "${atividadeModal.titulo}"?\n\nIsso apaga também o checklist, documentos, pendências e histórico dela. Esta ação não pode ser desfeita.`) && excluirAtividade.mutate(atividadeModal.id)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-600"
                    title="Excluir atividade"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => { setAtividadeAberta(null); setShowDevolver(false); setShowPendencia(false); setPendenciaEditando(null); setShowEditarAtividade(false); setShowEncerrarAtividade(false); setMotivoEncerrar('') }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
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
                <RichTextEditor
                  value={observacoesTexto}
                  onChange={setObservacoesTexto}
                  disabled={!podeEditarCampos(atividadeModal)}
                  placeholder="Registre aqui qualquer informação pertinente sobre esta atividade..."
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
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Documentos
                  </p>
                  {atividadeModal.documentos.filter(d => d.arquivoPath).length > 1 && (
                    <button
                      onClick={() => baixarTodosZip(atividadeModal.id, atividadeModal.titulo)}
                      disabled={baixandoZip}
                      className="text-xs text-primary-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                      <Download className="w-3 h-3" /> {baixandoZip ? 'Compactando...' : 'Baixar todos (.zip)'}
                    </button>
                  )}
                </div>
                {podeAnexarDocumento(atividadeModal) && (
                  <div className="space-y-2 mb-2">
                    {/* Anexo por link do Google Drive: oculto a pedido (não está em uso no momento),
                        mantido no código pra reativar facilmente depois — só mudar ANEXAR_LINK_DRIVE_VISIVEL. */}
                    {ANEXAR_LINK_DRIVE_VISIVEL && (
                      <>
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
                      </>
                    )}
                    <label className="btn-primary text-xs w-full justify-center cursor-pointer">
                      <Plus className="w-3.5 h-3.5" /> Enviar arquivo (PDF, DOC, XLS, imagem, DWG, ZIP, RAR...)
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg,.zip,.rar"
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
                        {podeAnexarDocumento(atividadeModal) && (
                          <button onClick={() => deleteDocumento.mutate(d.id)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Pendências Externas
                  </p>
                  {podeGerenciarChecklist(atividadeModal) && (
                    <button onClick={() => setShowPendencia(true)} className="btn-secondary text-xs">
                      <Plus className="w-3.5 h-3.5" /> Registrar
                    </button>
                  )}
                </div>

                {showPendencia && (
                  <div className="card space-y-3 mb-2">
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
                    <div>
                      <label className="label">Prazo esperado de resposta (opcional)</label>
                      <input type="date" className="input" value={pPrazoEsperado} onChange={e => setPPrazoEsperado(e.target.value)} />
                      <p className="text-xs text-gray-400 mt-1">Você recebe uma notificação nessa data pra verificar se já foi respondida.</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowPendencia(false)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
                      <button
                        onClick={() => pOrgao.trim() && pDescricao.trim() && createPendencia.mutate(atividadeModal.id)}
                        disabled={!pOrgao.trim() || !pDescricao.trim() || createPendencia.isPending}
                        className="btn-primary flex-1 justify-center text-xs"
                      >
                        Registrar
                      </button>
                    </div>
                  </div>
                )}

                {(() => {
                  const pendenciasDaAtividade = (demanda.pendenciasExternas || []).filter(p => p.atividadeId === atividadeModal.id)
                  if (pendenciasDaAtividade.length === 0 && !showPendencia) {
                    return <p className="text-xs text-gray-400 text-center py-3">Nenhuma pendência externa registrada</p>
                  }
                  return (
                    <div className="space-y-2">
                      {pendenciasDaAtividade.map(p => {
                        const podeGerenciarPendencia = podeGerenciarChecklist(atividadeModal)
                        if (pendenciaEditando === p.id) {
                          return (
                            <div key={p.id} className="card py-3 space-y-2">
                              <input className="input text-sm" placeholder="Órgão / Pessoa" value={pOrgaoEdicao} onChange={e => setPOrgaoEdicao(e.target.value)} autoFocus />
                              <textarea className="input text-sm min-h-16 resize-none" placeholder="Descrição" value={pDescricaoEdicao} onChange={e => setPDescricaoEdicao(e.target.value)} />
                              <input className="input text-sm" placeholder="Protocolo (opcional)" value={pProtocoloEdicao} onChange={e => setPProtocoloEdicao(e.target.value)} />
                              <div>
                                <label className="label">Prazo esperado de resposta (opcional)</label>
                                <input type="date" className="input text-sm" value={pPrazoEsperadoEdicao} onChange={e => setPPrazoEsperadoEdicao(e.target.value)} />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => setPendenciaEditando(null)} className="btn-secondary flex-1 justify-center text-xs">Cancelar</button>
                                <button
                                  onClick={() => pOrgaoEdicao.trim() && pDescricaoEdicao.trim() && editarPendencia.mutate({ id: p.id, orgao: pOrgaoEdicao.trim(), descricao: pDescricaoEdicao.trim(), protocolo: pProtocoloEdicao, prazoEsperado: pPrazoEsperadoEdicao })}
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
                                      onClick={() => { setPendenciaEditando(p.id); setPOrgaoEdicao(p.orgao); setPDescricaoEdicao(p.descricao); setPProtocoloEdicao(p.protocolo || ''); setPPrazoEsperadoEdicao(p.prazoEsperado ? p.prazoEsperado.slice(0, 10) : '') }}
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
                            {p.prazoEsperado && p.status !== 'RESPONDIDA' && (
                              <p className={`text-xs mt-1.5 ${new Date(p.prazoEsperado) < new Date() ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                                Prazo esperado: {format(new Date(p.prazoEsperado), 'dd/MM/yy', { locale: ptBR })}
                                {new Date(p.prazoEsperado) < new Date() ? ' — vencido' : ''}
                              </p>
                            )}
                            {p.status !== 'RESPONDIDA' && (
                              <button onClick={() => resolverPendencia.mutate(p.id)} className="text-xs text-primary-600 hover:underline mt-2">
                                Marcar como respondida
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 space-y-2">
              {atividadeModal.status === 'AGUARDANDO_INFORMACAO' && isResponsavel(atividadeModal) && (
                <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'EM_ANDAMENTO' })} className="btn-primary w-full justify-center">
                  Retomar atividade
                </button>
              )}
              {atividadeModal.status === 'DEVOLVIDA' && isResponsavel(atividadeModal) && (
                <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'EM_ANDAMENTO' })} className="btn-primary w-full justify-center">
                  Retomar atividade corrigida
                </button>
              )}
              {atividadeModal.status === 'EM_ANDAMENTO' && isResponsavel(atividadeModal) && !showFinalizar && (
                <div className="flex gap-2">
                  <button onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'AGUARDANDO_INFORMACAO' })} className="btn-secondary text-xs">
                    Aguardar informação
                  </button>
                  <button onClick={() => setShowFinalizar(true)} className="btn-primary flex-1 justify-center">
                    <CheckCircle2 className="w-4 h-4" /> Finalizar tarefa
                  </button>
                </div>
              )}
              {['EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO', 'DEVOLVIDA', 'REABERTA'].includes(atividadeModal.status) && isResponsavel(atividadeModal) && !showFinalizar && (
                <button onClick={() => setShowTransferir(true)} className="btn-secondary w-full justify-center text-xs">
                  <Repeat className="w-3.5 h-3.5" /> Transferir tarefa
                </button>
              )}
              {isMaster && ['ATRIBUIDA', 'EM_ANDAMENTO', 'AGUARDANDO_INFORMACAO', 'DEVOLVIDA', 'REABERTA'].includes(atividadeModal.status) && (
                <button onClick={() => setShowEncerrarAtividade(true)} className="btn-secondary w-full justify-center text-xs text-red-600 hover:bg-red-50">
                  <X className="w-3.5 h-3.5" /> Encerrar atividade
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

      {showEncerrarAtividade && atividadeModal && isMaster && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Encerrar atividade</h2>
              <button onClick={() => { setShowEncerrarAtividade(false); setMotivoEncerrar('') }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                Isso encerra a atividade <strong>&quot;{atividadeModal.titulo}&quot;</strong> (equipe {atividadeModal.equipe?.nome || '—'}) independentemente de quem seja o responsável, tirando-a da fila de qualquer usuário. Use quando a atividade não fizer mais sentido ser executada.
              </p>
              <div>
                <label className="label">Justificativa (opcional)</label>
                <textarea className="input min-h-16 resize-none" placeholder="Motivo do encerramento administrativo..." value={motivoEncerrar} onChange={e => setMotivoEncerrar(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => { setShowEncerrarAtividade(false); setMotivoEncerrar('') }} className="btn-secondary flex-1 justify-center">Voltar</button>
              <button
                onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'CANCELADA', motivo: motivoEncerrar.trim() || undefined })}
                disabled={statusAtividade.isPending}
                className="btn-danger flex-1 justify-center"
              >
                Encerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditarAtividade && atividadeModal && isMaster && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Editar atividade</h2>
              <button onClick={() => setShowEditarAtividade(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              <div>
                <label className="label">Título da atividade</label>
                <input className="input" value={editTitulo} onChange={e => setEditTitulo(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Instruções / solicitação específica</label>
                <textarea className="input min-h-16 resize-none" value={editInstrucoes} onChange={e => setEditInstrucoes(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Prazo de execução</label>
                  <input type="date" className="input" value={editPrazo} onChange={e => setEditPrazo(e.target.value)} />
                </div>
                <div>
                  <label className="label">Prioridade</label>
                  <select className="input" value={editPrioridade} onChange={e => setEditPrioridade(e.target.value as Prioridade)}>
                    {Object.entries(PRIORIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={editAnexoObrigatorio} onChange={e => setEditAnexoObrigatorio(e.target.checked)} className="w-3.5 h-3.5" />
                Anexo obrigatório para finalizar esta atividade
              </label>
              <p className="text-xs text-gray-400">
                Equipe e responsável não são editáveis aqui — use "Transferir tarefa" para mudar quem está com a atividade.
              </p>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowEditarAtividade(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button
                onClick={() => editTitulo.trim() && editarAtividade.mutate(atividadeModal.id)}
                disabled={!editTitulo.trim() || editarAtividade.isPending}
                className="btn-primary flex-1 justify-center"
              >
                Salvar
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
                onClick={() => statusAtividade.mutate({ atividadeId: atividadeModal.id, status: 'CONCLUIDA' })}
                disabled={(atividadeModal.anexoObrigatorio && atividadeModal.documentos.length === 0) || statusAtividade.isPending}
                className="btn-primary flex-1 justify-center"
              >
                Confirmar finalização
              </button>
            </div>
          </div>
        </div>
      )}

      {showDescricao && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Descrição</h3>
              <button onClick={() => setShowDescricao(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{demanda.descricao}</p>
            </div>
          </div>
        </div>
      )}

      {showEditarDemanda && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Editar demanda</h3>
              <button onClick={() => setShowEditarDemanda(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              <div>
                <label className="label">Assunto</label>
                <input className="input" value={editDemandaAssunto} onChange={e => setEditDemandaAssunto(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Interessado</label>
                <input className="input" value={editDemandaInteressado} onChange={e => setEditDemandaInteressado(e.target.value)} />
              </div>
              <div>
                <label className="label">Descrição</label>
                <textarea className="input min-h-24 resize-y" value={editDemandaDescricao} onChange={e => setEditDemandaDescricao(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Prazo</label>
                  <input type="date" className="input" value={editDemandaPrazo} onChange={e => setEditDemandaPrazo(e.target.value)} />
                </div>
                <div>
                  <label className="label">Prioridade</label>
                  <select className="input" value={editDemandaPrioridade} onChange={e => setEditDemandaPrioridade(e.target.value as Prioridade)}>
                    {Object.entries(PRIORIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowEditarDemanda(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button
                onClick={() => editDemandaAssunto.trim() && editarDemanda.mutate()}
                disabled={!editDemandaAssunto.trim() || editarDemanda.isPending}
                className="btn-primary flex-1 justify-center"
              >
                {editarDemanda.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResumo && isMaster && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-800 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> Resumo da demanda
                </h3>
                {comparacaoResumo === 'houve' && (
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">
                    Houve atualização nas atividades desde a última consulta.
                  </p>
                )}
                {comparacaoResumo === 'nao-houve' && (
                  <p className="text-xs text-red-600 font-medium mt-0.5">
                    Não houve atualização nas atividades desde a última consulta
                    {modoProsaIA ? ' — exibindo o texto em prosa gerado anteriormente.' : ' — considere não gerar a versão em prosa (IA) pra evitar gasto desnecessário.'}
                  </p>
                )}
                {comparacaoResumo === 'primeira' && (
                  <p className="text-xs text-gray-400 mt-0.5">Primeira consulta desta demanda — sem base anterior para comparar.</p>
                )}
                {modoProsaIA && (
                  <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                    {comparacaoResumo === 'nao-houve' ? 'Versão em prosa salva de uma consulta anterior.' : 'Versão em prosa gerada por IA — confira antes de usar oficialmente.'}
                    {provedorResumoIA === 'openai' && (
                      <span className="text-amber-600 font-medium">(via ChatGPT — Claude indisponível)</span>
                    )}
                  </p>
                )}
              </div>
              <button onClick={() => { setShowResumo(false); setModoProsaIA(false); setTextoResumoIA(''); setComparacaoResumo(null); setProvedorResumoIA(null) }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {gerarResumoIA.isPending ? (
                <div className="text-center py-10 text-sm text-gray-400">Gerando versão em prosa com IA...</div>
              ) : (
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-4 border border-gray-200">
                  {modoProsaIA ? textoResumoIA : gerarResumoDemanda(demanda, user?.name || 'Master')}
                </pre>
              )}
            </div>
            <div className="flex flex-wrap gap-2 p-5 border-t border-gray-100">
              <button onClick={() => { setShowResumo(false); setModoProsaIA(false); setTextoResumoIA(''); setComparacaoResumo(null); setProvedorResumoIA(null) }} className="btn-secondary flex-1 justify-center">Fechar</button>
              {modoProsaIA ? (
                <>
                  <button onClick={() => setModoProsaIA(false)} className="btn-secondary flex-1 justify-center">Ver estruturado</button>
                  <button
                    onClick={async () => {
                      // Reconfirma os dados antes de mandar pra IA — o modal pode ter ficado
                      // aberto um tempo e alguma atividade pode ter mudado nesse meio-tempo.
                      const atualizada = await refetchDemanda()
                      if (atualizada.data) gerarResumoIA.mutate(gerarResumoDemanda(atualizada.data, user?.name || 'Master'))
                    }}
                    disabled={gerarResumoIA.isPending}
                    className="btn-secondary flex-1 justify-center"
                  >
                    Gerar novamente
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    const atualizada = await refetchDemanda()
                    if (atualizada.data) gerarResumoIA.mutate(gerarResumoDemanda(atualizada.data, user?.name || 'Master'))
                  }}
                  disabled={gerarResumoIA.isPending}
                  className="btn-secondary flex-1 justify-center"
                >
                  Deixar em prosa (IA)
                </button>
              )}
              <button
                onClick={() => {
                  const texto = modoProsaIA ? textoResumoIA : gerarResumoDemanda(demanda, user?.name || 'Master')
                  navigator.clipboard.writeText(texto)
                  toast.success('Resumo copiado para a área de transferência')
                }}
                disabled={gerarResumoIA.isPending}
                className="btn-primary flex-1 justify-center"
              >
                Copiar texto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
