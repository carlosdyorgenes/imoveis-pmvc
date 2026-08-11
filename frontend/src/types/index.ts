export type UserRole = 'MASTER' | 'PADRAO'
export type TipoImovel = 'PROPRIO' | 'LOCADO'
export type ZonaImovel = 'URBANO' | 'RURAL'

export type StatusDemanda = 'ABERTA' | 'EM_ANDAMENTO' | 'PARCIALMENTE_CONCLUIDA' | 'AGUARDANDO_TERCEIRO' | 'DEVOLVIDA' | 'CONCLUIDA' | 'CANCELADA'
export type StatusAtividade = 'ATRIBUIDA' | 'EM_ANDAMENTO' | 'AGUARDANDO_INFORMACAO' | 'CONCLUIDA' | 'DEVOLVIDA' | 'APROVADA' | 'REABERTA' | 'CANCELADA'
export type Prioridade = 'ALTA' | 'MEDIA' | 'BAIXA'

export interface Duracao { minutos: number; texto: string }
export interface TemposAtividade { tempoEspera: Duracao; tempoExecucao: Duracao | null; tempoTotal: Duracao }

export interface Perfil {
  id: string
  nome: string
  descricao?: string
  permissoes: string[]
  createdAt: string
  usuarios: { id: string; name: string; email: string }[]
}

export interface PermissaoDisponivel {
  chave: string
  descricao: string
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  createdAt: string
  perfilId?: string | null
  perfil?: { id: string; nome: string } | null
}

export interface Documento {
  id: string
  imovelId: string
  descricao: string
  linkDrive: string
  createdAt: string
}

export interface Imovel {
  id: string
  inscricaoImobiliaria: string
  registroCartorario?: string
  cartorioImoveis?: string
  logradouro: string
  numero?: string
  complemento?: string
  bairro: string
  cidade: string
  estado: string
  cep?: string
  secretaria: string
  tipo: TipoImovel
  zona: ZonaImovel
  latitude?: number
  longitude?: number
  estimado?: boolean
  precisaoGeo?: 'casa' | 'rua' | 'area'
  area?: number
  observacoes?: string
  documentos?: Documento[]
  ocorrencias?: Ocorrencia[]
  _count?: { ocorrencias: number }
  createdAt: string
  updatedAt: string
}

export interface Ocorrencia {
  id: string
  imovelId: string
  userId: string
  descricao: string
  tipo: string
  createdAt: string
  user?: { name: string }
  imovel?: { inscricaoImobiliaria: string; logradouro: string; bairro: string }
}

export interface Passo {
  id: string
  cardId: string
  descricao: string
  concluido: boolean
  ordem: number
  etapaId?: string | null
  etapaTitulo?: string | null
  createdAt: string
}

export interface TarefaCard {
  id: string
  etapaId: string
  imovelId: string
  userId: string
  observacoes?: string
  ordem: number
  createdAt: string
  imovel: Imovel
  user: { name: string }
  passos: Passo[]
}

export interface Etapa {
  id: string
  tarefaId: string
  titulo: string
  ordem: number
  cards: TarefaCard[]
  createdAt: string
}

export interface Tarefa {
  id: string
  titulo: string
  descricao?: string
  ordem: number
  etapas: Etapa[]
  createdAt: string
}

export interface PassoAtividade {
  id: string
  atividadeId: string
  descricao: string
  concluido: boolean
  ordem: number
  createdAt: string
}

export interface DocumentoAtividade {
  id: string
  atividadeId: string
  nome: string
  linkDrive: string
  versao: number
  arquivoPath?: string | null
  arquivoMime?: string | null
  arquivoTamanho?: number | null
  arquivoHash?: string | null
  createdAt: string
}

export interface Atividade {
  id: string
  demandaId: string
  titulo: string
  instrucoes?: string
  status: StatusAtividade
  prioridade: Prioridade
  prazo?: string
  observacoes?: string
  motivoDevolucao?: string
  linkDocumento?: string
  anexoObrigatorio: boolean
  dataInicio?: string | null
  dataConclusao?: string | null
  informacoesFinalizacao?: string | null
  createdAt: string
  responsavel: { id: string; name: string } | null
  equipe: { id: string; nome: string } | null
  solicitante: { id: string; name: string }
  passos: PassoAtividade[]
  documentos: DocumentoAtividade[]
  tempos?: TemposAtividade
}

export interface EquipeMembro {
  id: string
  equipeId: string
  userId: string
  principal: boolean
  user: { id: string; name: string; email: string; active: boolean }
}

export interface Equipe {
  id: string
  nome: string
  descricao?: string
  ativo: boolean
  createdAt: string
  membros: EquipeMembro[]
}

export interface PendenciaExterna {
  id: string
  demandaId: string
  atividadeId?: string | null
  orgao: string
  descricao: string
  dataSolicitacao: string
  protocolo?: string
  prazoEsperado?: string
  status: string
  resposta?: string
  ultimaCobranca?: string
  createdAt: string
}

export interface Notificacao {
  id: string
  userId: string
  tipo: string
  mensagem: string
  demandaId?: string
  atividadeId?: string
  lida: boolean
  createdAt: string
}

export interface HistoricoDemanda {
  id: string
  demandaId: string
  userId?: string
  acao: string
  descricao: string
  createdAt: string
}

export interface Comentario {
  id: string
  demandaId: string
  userId: string
  texto: string
  createdAt: string
  user: { id: string; name: string }
}

export interface Demanda {
  id: string
  gepNumero: string
  gepAno: string
  assunto: string
  descricao?: string
  interessado?: string
  status: StatusDemanda
  prioridade: Prioridade
  prazo?: string
  createdAt: string
  solicitante: { id: string; name: string }
  atividades: Atividade[]
  historico?: HistoricoDemanda[]
  pendenciasExternas?: PendenciaExterna[]
  comentarios?: Comentario[]
}

export interface Log {
  id: string
  userId?: string
  action: string
  entity: string
  entityId?: string
  details?: string
  ip?: string
  createdAt: string
  user?: { name: string; email: string }
}
