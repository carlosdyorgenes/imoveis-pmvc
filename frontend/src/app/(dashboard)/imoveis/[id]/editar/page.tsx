'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Imovel } from '@/types'
import { ImovelForm, ImovelFormData } from '@/components/ImovelForm'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

export default function EditarImovelPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const qc = useQueryClient()

  const { data: imovel, isLoading } = useQuery<Imovel>({
    queryKey: ['imovel', id],
    queryFn: () => api.get(`/api/imoveis/${id}`).then(r => r.data)
  })

  const mutation = useMutation({
    mutationFn: (data: ImovelFormData) => api.put(`/api/imoveis/${id}`, data),
    onSuccess: () => {
      toast.success('Imóvel atualizado!')
      qc.invalidateQueries({ queryKey: ['imovel', id] })
      qc.invalidateQueries({ queryKey: ['imoveis'] })
      router.push(`/imoveis/${id}`)
    },
    onError: () => toast.error('Erro ao atualizar')
  })

  if (isLoading) return <div className="p-8 text-center text-gray-400">Carregando...</div>

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/imoveis/${id}`} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editar Imóvel</h1>
          <p className="text-gray-500 mt-0.5 font-mono text-sm">{imovel?.inscricaoImobiliaria}</p>
        </div>
      </div>
      <div className="card">
        {imovel && <ImovelForm defaultValues={imovel} onSubmit={mutation.mutate} loading={mutation.isPending} />}
      </div>
    </div>
  )
}
