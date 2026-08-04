import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import { AppError } from '../middleware/errorHandler'
import { createLog } from '../utils/logger'
import { authenticate, requireMaster, AuthRequest } from '../middleware/auth'
import { novoEstado, verificarBloqueio, registrarFalha, registrarSucesso, EstadoTentativas } from '../domain/loginRateLimit'

export const authRouter = Router()

// Estado em memória por e-mail (chave normalizada em minúsculas) — ver domain/loginRateLimit.ts
const tentativasPorEmail = new Map<string, EstadoTentativas>()

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) throw new AppError('Email e senha são obrigatórios')

  const chave = String(email).trim().toLowerCase()
  const agora = Date.now()
  const estadoAtual = tentativasPorEmail.get(chave) || novoEstado()
  const { bloqueado, segundosRestantes } = verificarBloqueio(estadoAtual, agora)
  if (bloqueado) {
    const minutos = Math.ceil(segundosRestantes / 60)
    throw new AppError(`Muitas tentativas de login. Tente novamente em ${minutos} minuto(s).`, 429)
  }

  // Busca case-insensitive: o e-mail cadastrado pode ter sido salvo com maiúsculas e o
  // usuário não deveria precisar digitar exatamente igual para entrar.
  const user = await prisma.user.findFirst({ where: { email: { equals: chave, mode: 'insensitive' } } })
  const valid = user && user.active && (await bcrypt.compare(password, user.password))

  if (!valid) {
    tentativasPorEmail.set(chave, registrarFalha(estadoAtual, agora))
    throw new AppError('Credenciais inválidas', 401)
  }

  tentativasPorEmail.set(chave, registrarSucesso())

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: '8h' })

  await createLog({ userId: user.id, action: 'LOGIN', entity: 'USER', entityId: user.id, ip: req.ip })

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
})

authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  res.json(req.user)
})

authRouter.post('/logout', authenticate, async (req: AuthRequest, res) => {
  await createLog({ userId: req.user!.id, action: 'LOGOUT', entity: 'USER', entityId: req.user!.id, ip: req.ip })
  res.json({ message: 'Logout realizado' })
})

// Solicitar redefinição de senha
authRouter.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email) throw new AppError('Email é obrigatório')

  const user = await prisma.user.findFirst({ where: { email: { equals: String(email).trim(), mode: 'insensitive' } } })
  if (!user || !user.active) {
    throw new AppError('O e-mail informado não está cadastrado no sistema.', 404)
  }

  // Verificar se já há solicitação pendente
  const pendente = await prisma.solicitacaoSenha.findFirst({
    where: { userId: user.id, status: 'PENDENTE' }
  })
  if (pendente) {
    return res.json({ message: 'Já existe uma solicitação pendente para este e-mail. Aguarde o administrador redefinir sua senha.' })
  }

  await prisma.solicitacaoSenha.create({ data: { userId: user.id } })
  await createLog({ userId: user.id, action: 'FORGOT_PASSWORD', entity: 'USER', entityId: user.id, ip: req.ip })

  res.json({ message: 'Solicitação registrada. Sua senha será redefinida pelo administrador do sistema.' })
})

// Listar solicitações pendentes (master only)
authRouter.get('/password-requests', authenticate, requireMaster, async (req, res) => {
  const requests = await prisma.solicitacaoSenha.findMany({
    where: { status: 'PENDENTE' },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' }
  })
  res.json(requests)
})

// Contar pendentes (para badge)
authRouter.get('/password-requests/count', authenticate, requireMaster, async (req, res) => {
  const count = await prisma.solicitacaoSenha.count({ where: { status: 'PENDENTE' } })
  res.json({ count })
})

// Resolver solicitação (master redefine senha)
authRouter.put('/password-requests/:id/resolve', authenticate, requireMaster, async (req: AuthRequest, res) => {
  const { novaSenha } = req.body
  if (!novaSenha || novaSenha.length < 6) throw new AppError('Nova senha deve ter ao menos 6 caracteres')

  const solicitacao = await prisma.solicitacaoSenha.findUnique({
    where: { id: req.params.id },
    include: { user: true }
  })
  if (!solicitacao) throw new AppError('Solicitação não encontrada', 404)

  const hash = await bcrypt.hash(novaSenha, 10)
  await prisma.user.update({ where: { id: solicitacao.userId }, data: { password: hash } })
  await prisma.solicitacaoSenha.update({
    where: { id: req.params.id },
    data: { status: 'RESOLVIDO', resolvedAt: new Date(), resolvedById: req.user!.id }
  })

  await createLog({
    userId: req.user!.id,
    action: 'RESET_PASSWORD',
    entity: 'USER',
    entityId: solicitacao.userId,
    details: `Senha redefinida para ${solicitacao.user.email}`
  })

  res.json({ message: `Senha de ${solicitacao.user.name} redefinida com sucesso.` })
})
