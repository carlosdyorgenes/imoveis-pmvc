'use client'
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Imovel } from '@/types'
import { Plus, Search, Upload, Download, MapPin, Eye, Pencil, Trash2, FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { useSearchParams } from 'next/navigation'

export default function ImoveisPage() {
  const qc = useQueryClient()
  const { isMaster } = useAuth()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [tipo, setTipo] = useState(searchParams.get('tipo') || '')
  const [zona, setZona] = useState(searchParams.get('zona') || '')
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: imoveis = [], isLoading } = useQuery<Imovel[]>({
    queryKey: ['imoveis', search, tipo, zona],
    queryFn: () => api.get('/api/imoveis', { params: { search, tipo, zona } }).then(r => r.data)
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/imoveis/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['imoveis'] }); toast.success('Imóvel excluído') }
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post('/api/imoveis/import/upload', fd)
      toast.success(`${res.data.success} imóveis importados`)
      if (res.data.errors.length > 0) toast.error(`${res.data.errors.length} erros`)
      qc.invalidateQueries({ queryKey: ['imoveis'] })
    } catch { toast.error('Erro ao importar') }
  }

  const handleDelete = (id: string, inscricao: string) => {
    if (!confirm(`Excluir imóvel ${inscricao}?`)) return
    deleteMutation.mutate(id)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Imóveis</h1>
          <p className="text-gray-500 mt-0.5">{imoveis.length} imóvel(is) cadastrado(s)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => api.get('/api/imoveis/template/download', { responseType: 'blob' }).then(r => {
            const url = URL.createObjectURL(r.data)
            const a = document.createElement('a'); a.href = url; a.download = 'template_imoveis.xlsx'; a.click()
          })} className="btn-secondary text-xs">
            <Download className="w-3.5 h-3.5" /> Template
          </button>
          <label className="btn-secondary text-xs cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Importar
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
          </label>
          <Link href="/imoveis/novo" className="btn-primary text-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Imóvel
          </Link>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por inscrição, endereço ou bairro..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input sm:w-40" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="PROPRIO">Próprio</option>
            <option value="LOCADO">Locado</option>
          </select>
          <select className="input sm:w-40" value={zona} onChange={e => setZona(e.target.value)}>
            <option value="">Todas as zonas</option>
            <option value="URBANO">Urbano</option>
            <option value="RURAL">Rural</option>
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : imoveis.length === 0 ? (
          <div className="p-8 text-center">
            <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhum imóvel encontrado</p>
            <Link href="/imoveis/novo" className="btn-primary mt-4">
              <Plus className="w-4 h-4" /> Cadastrar Imóvel
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Inscrição</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Endereço</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Secretaria</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Zona</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Geo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ocorr.</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {imoveis.map(im => (
                  <tr key={im.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-primary-700">{im.inscricaoImobiliaria}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                      {im.logradouro}, {im.numero || 'S/N'} - {im.bairro}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{im.secretaria}</td>
                    <td className="px-4 py-3">
                      <span className={im.tipo === 'PROPRIO' ? 'badge-proprio' : 'badge-locado'}>{im.tipo}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={im.zona === 'URBANO' ? 'badge-urbano' : 'badge-rural'}>{im.zona}</span>
                    </td>
                    <td className="px-4 py-3">
                      {im.latitude && im.longitude ? (
                        <span className="text-green-600 text-xs">✓ Sim</span>
                      ) : (
                        <span className="text-gray-400 text-xs">— Não</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">
                        {im._count?.ocorrencias || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        {im.latitude && im.longitude && (
                          <a
                            href={`https://maps.google.com/?q=${im.latitude},${im.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Ver no mapa"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <Link href={`/imoveis/${im.id}`} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                        <Link href={`/imoveis/${im.id}/editar`} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        {isMaster && (
                          <button onClick={() => handleDelete(im.id, im.inscricaoImobiliaria)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
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
