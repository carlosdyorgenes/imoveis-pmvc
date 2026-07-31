export type UserRole = 'MASTER' | 'PADRAO'
export type TipoImovel = 'PROPRIO' | 'LOCADO'
export type ZonaImovel = 'URBANO' | 'RURAL'

export type StatusDemanda = 'ABERTA' | 'EM_ANDAMENTO' | 'AGUARDANDO_TERCEIRO' | 'DEVOLVIDA' | 'CONCLUIDA' | 'CANCELADA'
export type StatusAtividade = 'ATRIBUIDA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'DEVOLVIDA' | 'APROVADA' | 'CANCELADA'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  createdAt: string
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

export interface Atividade {
  id: string
  demandaId: string
  titulo: string
  instrucoes?: string
  status: StatusAtividade
  prazo?: string
  observacoes?: string
  motivoDevolucao?: string
  linkDocumento?: string
  createdAt: string
  responsavel: { id: string; name: string }
  solicitante: { id: string; name: string }
  passos: PassoAtividade[]
}

export interface HistoricoDemanda {
  id: string
  demandaId: string
  userId?: string
  acao: string
  descricao: string
  createdAt: string
}

export interface Demanda {
  id: string
  gepNumero: string
  gepAno: string
  assunto: string
  descricao?: string
  interessado?: string
  status: StatusDemanda
  prazo?: string
  createdAt: string
  solicitante: { id: string; name: string }
  atividades: Atividade[]
  historico?: HistoricoDemanda[]
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
