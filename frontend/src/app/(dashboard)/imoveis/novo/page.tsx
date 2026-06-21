'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ImovelForm, ImovelFormData } from '@/components/ImovelForm'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NovoImovelPage() {
  const router = useRouter()
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: ImovelFormData) => api.post('/api/imoveis', data),
    onSuccess: () => {
      toast.success('Imóvel cadastrado com sucesso!')
      qc.invalidateQueries({ queryKey: ['imoveis'] })
      router.push('/imoveis')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao cadastrar'
      toast.error(msg)
    }
  })

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/imoveis" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Novo Imóvel</h1>
          <p className="text-gray-500 mt-0.5">Preencha os dados para cadastrar o imóvel</p>
        </div>
      </div>

      <div className="card">
        <ImovelForm onSubmit={mutation.mutate} loading={mutation.isPending} />
      </div>
    </div>
  )
}
