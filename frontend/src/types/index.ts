export type UserRole = 'MASTER' | 'PADRAO'
export type TipoImovel = 'PROPRIO' | 'LOCADO'
export type ZonaImovel = 'URBANO' | 'RURAL'

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

export interface TarefaCard {
  id: string
  tarefaId: string
  imovelId: string
  userId: string
  observacoes?: string
  ordem: number
  createdAt: string
  imovel: Imovel
  user: { name: string }
}

export interface Tarefa {
  id: string
  titulo: string
  descricao?: string
  ordem: number
  cards: TarefaCard[]
  createdAt: string
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
