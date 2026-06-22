'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import Image from 'next/image'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Lock, Mail, X } from 'lucide-react'

interface LoginForm { email: string; password: string }

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const { register, handleSubmit } = useForm<LoginForm>()

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    try {
      const res = await api.post('/api/auth/login', data)
      login(res.data.token, res.data.user)
      router.push('/dashboard')
    } catch {
      toast.error('Email ou senha incorretos')
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async () => {
    if (!forgotEmail) return
    setForgotLoading(true)
    try {
      const res = await api.post('/api/auth/forgot-password', { email: forgotEmail })
      toast.success(res.data.message)
      setForgotSent(true)
    } catch {
      toast.error('Erro ao enviar solicitação')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-800 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header com logo e textos brancos */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/brasao.png"
              alt="Brasão de Vitória da Conquista"
              width={150}
              height={150}
              className="drop-shadow-lg"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-white leading-tight">
            Sistema de Controle de Imóveis
          </h1>
          <p className="text-white/90 mt-1 text-sm font-medium">
            Prefeitura Municipal de Vitória da Conquista
          </p>
        </div>

        {/* Card de login */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-5 text-center">Acesso ao Sistema</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  {...register('email', { required: true })}
                  type="email"
                  className="input pl-10"
                  placeholder="seu@email.gov.br"
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  {...register('password', { required: true })}
                  type="password"
                  className="input pl-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-1">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          {/* Esqueci a senha */}
          <div className="mt-4 text-center">
            <button
              onClick={() => { setShowForgot(true); setForgotSent(false); setForgotEmail('') }}
              className="text-sm text-primary-600 hover:text-primary-800 hover:underline transition-colors"
            >
              Esqueci minha senha
            </button>
          </div>

          {/* Aviso de acesso restrito */}
          <p className="mt-5 text-center text-xs text-gray-400 border-t border-gray-100 pt-4">
            Acesso restrito a servidores autorizados
          </p>
        </div>
      </div>

      {/* Modal Esqueci Senha */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Redefinir Senha</h3>
              <button onClick={() => setShowForgot(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {forgotSent ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">✓</span>
                </div>
                <p className="text-sm text-gray-700 font-medium">Solicitação registrada!</p>
                <p className="text-xs text-gray-500 mt-2">
                  O administrador foi notificado e irá redefinir sua senha em breve.
                </p>
                <button
                  onClick={() => setShowForgot(false)}
                  className="btn-primary mt-4 w-full justify-center"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Informe seu email. O administrador do sistema será notificado para redefinir sua senha.
                </p>
                <div className="mb-4">
                  <label className="label">Email cadastrado</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="seu@email.gov.br"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleForgot()}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowForgot(false)} className="btn-secondary flex-1 justify-center">
                    Cancelar
                  </button>
                  <button
                    onClick={handleForgot}
                    disabled={!forgotEmail || forgotLoading}
                    className="btn-primary flex-1 justify-center"
                  >
                    {forgotLoading ? 'Enviando...' : 'Solicitar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
