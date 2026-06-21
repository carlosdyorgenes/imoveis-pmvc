'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { User } from '@/types'
import { Plus, Pencil, Trash2, Users, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { useForm } from 'react-hook-form'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface UserForm {
  name: string
  email: string
  password: string
  role: 'MASTER' | 'PADRAO'
  active: boolean
}

export default function UsuariosPage() {
  const qc = useQueryClient()
  const { isMaster } = useAuth()
  const [modal, setModal] = useState<'new' | { user: User } | null>(null)

  const { data: usuarios = [] } = useQuery<User[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/api/usuarios').then(r => r.data)
  })

  const { register, handleSubmit, reset, setValue } = useForm<UserForm>({ defaultValues: { role: 'PADRAO', active: true } })

  const openEdit = (user: User) => {
    setValue('name', user.name)
    setValue('email', user.email)
    setValue('role', user.role)
    setValue('active', user.active)
    setValue('password', '')
    setModal({ user })
  }

  const openNew = () => {
    reset({ role: 'PADRAO', active: true })
    setModal('new')
  }

  const createMutation = useMutation({
    mutationFn: (data: UserForm) => api.post('/api/usuarios', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); setModal(null); toast.success('Usuário criado') }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserForm> }) => api.put(`/api/usuarios/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); setModal(null); toast.success('Usuário atualizado') }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/usuarios/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); toast.success('Usuário excluído') }
  })

  const onSubmit = (data: UserForm) => {
    if (modal === 'new') {
      createMutation.mutate(data)
    } else if (modal && typeof modal === 'object') {
      const payload: Partial<UserForm> = { name: data.name, email: data.email, role: data.role, active: data.active }
      if (data.password) payload.password = data.password
      updateMutation.mutate({ id: modal.user.id, data: payload })
    }
  }

  if (!isMaster) return <div className="p-8 text-center text-gray-400">Acesso restrito ao administrador</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
          <p className="text-gray-500 mt-0.5">{usuarios.length} usuário(s) cadastrado(s)</p>
        </div>
        <button onClick={openNew} className="btn-primary text-xs">
          <Plus className="w-3.5 h-3.5" /> Novo Usuário
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Perfil</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cadastrado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {usuarios.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    {u.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    u.role === 'MASTER' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {u.role === 'MASTER' ? 'Administrador' : 'Padrão'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1 text-xs w-fit ${u.active ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {u.active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {u.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {format(new Date(u.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => confirm(`Excluir ${u.name}?`) && deleteMutation.mutate(u.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {usuarios.length === 0 && (
          <div className="p-8 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">Nenhum usuário cadastrado</p>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-semibold text-lg">{modal === 'new' ? 'Novo Usuário' : 'Editar Usuário'}</h2>
              <button onClick={() => setModal(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div>
                <label className="label">Nome *</label>
                <input {...register('name', { required: true })} className="input" placeholder="Nome completo" />
              </div>
              <div>
                <label className="label">Email *</label>
                <input {...register('email', { required: true })} type="email" className="input" placeholder="email@pmvc.gov.br" />
              </div>
              <div>
                <label className="label">Senha {modal !== 'new' && '(deixe em branco para manter)'}</label>
                <input {...register('password')} type="password" className="input" placeholder="••••••••" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Perfil</label>
                  <select {...register('role')} className="input">
                    <option value="PADRAO">Padrão</option>
                    <option value="MASTER">Master</option>
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select {...register('active', { setValueAs: v => v === 'true' || v === true })} className="input">
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button type="submit" className="btn-primary flex-1 justify-center">
                  {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
