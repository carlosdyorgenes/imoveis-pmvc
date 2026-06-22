'use client'
import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { Imovel } from '@/types'
import { Plus, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export interface ImovelFormData {
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
  tipo: 'PROPRIO' | 'LOCADO'
  zona: 'URBANO' | 'RURAL'
  latitude?: number
  longitude?: number
  area?: number
  observacoes?: string
  documentos?: { descricao: string; linkDrive: string }[]
}

interface Props {
  defaultValues?: Partial<Imovel>
  onSubmit: (data: ImovelFormData) => void
  loading?: boolean
}

const TABS = ['Dados Cadastrais', 'Documentos']

const estados = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function ImovelForm({ defaultValues, onSubmit, loading }: Props) {
  const [tab, setTab] = useState(0)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const { register, handleSubmit, control, setValue, setFocus, formState: { errors } } = useForm<ImovelFormData>({
    defaultValues: {
      tipo: 'PROPRIO',
      zona: 'URBANO',
      estado: 'BA',
      cidade: 'Vitória da Conquista',
      documentos: [],
      ...defaultValues,
    }
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'documentos' })

  const buscarCep = async (cepRaw: string) => {
    const cep = cepRaw.replace(/\D/g, '')
    if (cep.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (data.erro) {
        toast.error('CEP não encontrado')
        return
      }
      if (data.logradouro) setValue('logradouro', data.logradouro)
      if (data.bairro) setValue('bairro', data.bairro)
      if (data.localidade) setValue('cidade', data.localidade)
      if (data.uf) setValue('estado', data.uf)
      if (data.complemento) setValue('complemento', data.complemento)
      toast.success('Endereço preenchido pelo CEP')
      setFocus('numero')
    } catch {
      toast.error('Erro ao consultar o CEP')
    } finally {
      setBuscandoCep(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === i ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
            {i === 1 && fields.length > 0 && (
              <span className="ml-2 bg-primary-100 text-primary-700 text-xs px-1.5 py-0.5 rounded-full">{fields.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Inscrição Imobiliária Municipal *</label>
              <input {...register('inscricaoImobiliaria', { required: 'Obrigatório' })} className="input" placeholder="Ex: 0001.01.001.0001" />
              {errors.inscricaoImobiliaria && <p className="text-red-500 text-xs mt-1">{errors.inscricaoImobiliaria.message}</p>}
            </div>
            <div>
              <label className="label">Nº Registro Cartorário</label>
              <input {...register('registroCartorario')} className="input" placeholder="Número do registro" />
            </div>
          </div>

          <div>
            <label className="label">Cartório de Imóveis</label>
            <input {...register('cartorioImoveis')} className="input" placeholder="Nome do cartório" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2 md:col-span-3">
              <label className="label">Logradouro *</label>
              <input {...register('logradouro', { required: 'Obrigatório' })} className="input" placeholder="Rua, Avenida, etc." />
              {errors.logradouro && <p className="text-red-500 text-xs mt-1">{errors.logradouro.message}</p>}
            </div>
            <div>
              <label className="label">Número</label>
              <input {...register('numero')} className="input" placeholder="S/N" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Complemento</label>
              <input {...register('complemento')} className="input" placeholder="Apto, Bloco..." />
            </div>
            <div>
              <label className="label">Bairro *</label>
              <input {...register('bairro', { required: 'Obrigatório' })} className="input" />
              {errors.bairro && <p className="text-red-500 text-xs mt-1">{errors.bairro.message}</p>}
            </div>
            <div>
              <label className="label">CEP</label>
              <div className="relative">
                <input
                  {...register('cep', {
                    onBlur: (e) => buscarCep(e.target.value),
                  })}
                  className="input pr-9"
                  placeholder="00000-000"
                  maxLength={9}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      buscarCep((e.target as HTMLInputElement).value)
                    }
                  }}
                />
                {buscandoCep && (
                  <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 text-primary-500 animate-spin" />
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Preenche o endereço automaticamente</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Cidade *</label>
              <input {...register('cidade', { required: 'Obrigatório' })} className="input" />
              {errors.cidade && <p className="text-red-500 text-xs mt-1">{errors.cidade.message}</p>}
            </div>
            <div>
              <label className="label">Estado *</label>
              <select {...register('estado', { required: 'Obrigatório' })} className="input">
                {estados.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Secretaria *</label>
            <input {...register('secretaria', { required: 'Obrigatório' })} className="input" placeholder="Secretaria responsável" />
            {errors.secretaria && <p className="text-red-500 text-xs mt-1">{errors.secretaria.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo do Imóvel</label>
              <select {...register('tipo')} className="input">
                <option value="PROPRIO">Próprio</option>
                <option value="LOCADO">Locado</option>
              </select>
            </div>
            <div>
              <label className="label">Zona</label>
              <select {...register('zona')} className="input">
                <option value="URBANO">Urbano</option>
                <option value="RURAL">Rural</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Latitude</label>
              <input {...register('latitude', { valueAsNumber: true })} type="number" step="any" className="input" placeholder="-14.8529" />
            </div>
            <div>
              <label className="label">Longitude</label>
              <input {...register('longitude', { valueAsNumber: true })} type="number" step="any" className="input" placeholder="-40.8440" />
            </div>
            <div>
              <label className="label">Área (m²)</label>
              <input {...register('area', { valueAsNumber: true })} type="number" step="any" className="input" placeholder="0.00" />
            </div>
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea {...register('observacoes')} rows={3} className="input resize-none" placeholder="Informações adicionais..." />
          </div>
        </div>
      )}

      {tab === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">Adicione os documentos relacionados ao imóvel</p>
            <button
              type="button"
              onClick={() => append({ descricao: '', linkDrive: '' })}
              className="btn-secondary text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Documento
            </button>
          </div>

          {fields.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
              <ExternalLink className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Nenhum documento adicionado</p>
              <button type="button" onClick={() => append({ descricao: '', linkDrive: '' })} className="btn-primary mt-3 text-xs">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
          )}

          <div className="space-y-3">
            {fields.map((field, i) => (
              <div key={field.id} className="flex gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Descrição</label>
                    <input {...register(`documentos.${i}.descricao`, { required: true })} className="input" placeholder="Ex: Escritura, IPTU..." />
                  </div>
                  <div>
                    <label className="label">Link do Google Drive</label>
                    <input {...register(`documentos.${i}.linkDrive`, { required: true })} className="input" placeholder="https://drive.google.com/..." />
                  </div>
                </div>
                <button type="button" onClick={() => remove(i)} className="self-end p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
        <div className="flex gap-2">
          {tab > 0 && (
            <button type="button" onClick={() => setTab(t => t - 1)} className="btn-secondary">
              ← Anterior
            </button>
          )}
          {tab < TABS.length - 1 && (
            <button type="button" onClick={() => setTab(t => t + 1)} className="btn-secondary">
              Próximo →
            </button>
          )}
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Salvando...' : 'Salvar Imóvel'}
        </button>
      </div>
    </form>
  )
}
