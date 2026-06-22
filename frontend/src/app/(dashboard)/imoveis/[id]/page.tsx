'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Imovel, Ocorrencia } from '@/types'
import { ArrowLeft, MapPin, Pencil, ExternalLink, Plus, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'

export default function ImovelDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const qc = useQueryClient()
  const [novaOc, setNovaOc] = useState('')

  const { data: imovel, isLoading } = useQuery<Imovel>({
    queryKey: ['imovel', id],
    queryFn: () => api.get(`/api/imoveis/${id}`).then(r => r.data)
  })

  const addOcMutation = useMutation({
    mutationFn: () => api.post('/api/ocorrencias', { imovelId: id, descricao: novaOc }),
    onSuccess: () => {
      setNovaOc('')
      qc.invalidateQueries({ queryKey: ['imovel', id] })
      toast.success('Ocorrência registrada')
    }
  })

  if (isLoading) return <div className="p-8 text-center text-gray-400">Carregando...</div>
  if (!imovel) return <div className="p-8 text-center text-gray-400">Imóvel não encontrado</div>

  const endereco = `${imovel.logradouro}, ${imovel.numero || 'S/N'}${imovel.complemento ? ', ' + imovel.complemento : ''} - ${imovel.bairro}, ${imovel.cidade}/${imovel.estado}${imovel.cep ? ' - CEP: ' + imovel.cep : ''}`

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/imoveis" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{imovel.inscricaoImobiliaria}</h1>
          <p className="text-gray-500 mt-0.5 truncate">{endereco}</p>
        </div>
        <div className="flex gap-2">
          {imovel.latitude && imovel.longitude && (
            <a
              href={`https://maps.google.com/?q=${imovel.latitude},${imovel.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs"
            >
              <MapPin className="w-3.5 h-3.5 text-green-600" /> Ver no Mapa
            </a>
          )}
          <Link href={`/imoveis/${id}/editar`} className="btn-primary text-xs">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4">Dados Cadastrais</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['Inscrição Imobiliária', imovel.inscricaoImobiliaria],
                ['Registro Cartorário', imovel.registroCartorario || '—'],
                ['Cartório', imovel.cartorioImoveis || '—'],
                ['Secretaria', imovel.secretaria],
                ['Tipo', imovel.tipo],
                ['Zona', imovel.zona],
                ['Área', imovel.area ? `${imovel.area} m²` : '—'],
                ['Coordenadas', imovel.latitude ? `${imovel.latitude}, ${imovel.longitude}` : '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-gray-500 text-xs">{k}</p>
                  <p className="font-medium text-gray-800">{v}</p>
                </div>
              ))}
            </div>
            {imovel.observacoes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-gray-500 text-xs mb-1">Observações</p>
                <p className="text-sm text-gray-700">{imovel.observacoes}</p>
              </div>
            )}
          </div>

          {imovel.documentos && imovel.documentos.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-4">Documentos</h2>
              <div className="space-y-2">
                {imovel.documentos.map(doc => (
                  <a
                    key={doc.id}
                    href={doc.linkDrive}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-primary-600" />
                    <span className="text-sm text-gray-700 group-hover:text-primary-700">{doc.descricao}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-purple-500" />
              Ficha de Ocorrências
            </h2>

            <div className="mb-4">
              <textarea
                value={novaOc}
                onChange={e => setNovaOc(e.target.value)}
                rows={3}
                className="input resize-none text-sm"
                placeholder="Registrar nova ocorrência..."
              />
              <button
                onClick={() => novaOc.trim() && addOcMutation.mutate()}
                disabled={!novaOc.trim() || addOcMutation.isPending}
                className="btn-primary w-full justify-center mt-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Registrar Ocorrência
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(imovel.ocorrencias || []).map((oc: Ocorrencia) => (
                <div key={oc.id} className="border-l-2 border-purple-200 pl-3 py-1">
                  <p className="text-sm text-gray-700">{oc.descricao}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      oc.tipo === 'TAREFA'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>{oc.tipo}</span>
                    <span className="text-gray-400 text-xs">{oc.user?.name}</span>
                    <span className="text-gray-300 text-xs">·</span>
                    <span className="text-gray-400 text-xs">
                      {format(new Date(oc.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              ))}
              {(!imovel.ocorrencias || imovel.ocorrencias.length === 0) && (
                <p className="text-gray-400 text-sm text-center py-4">Nenhuma ocorrência registrada</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
