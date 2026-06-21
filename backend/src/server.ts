import 'express-async-errors'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'

import { authRouter } from './routes/auth.routes'
import { imoveisRouter } from './routes/imoveis.routes'
import { ocorrenciasRouter } from './routes/ocorrencias.routes'
import { tarefasRouter } from './routes/tarefas.routes'
import { usuariosRouter } from './routes/usuarios.routes'
import { relatoriosRouter } from './routes/relatorios.routes'
import { logsRouter } from './routes/logs.routes'
import { errorHandler } from './middleware/errorHandler'

const app = express()

app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(morgan('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

app.get('/health', (_, res) => res.json({ status: 'ok' }))

app.use('/api/auth', authRouter)
app.use('/api/imoveis', imoveisRouter)
app.use('/api/ocorrencias', ocorrenciasRouter)
app.use('/api/tarefas', tarefasRouter)
app.use('/api/usuarios', usuariosRouter)
app.use('/api/relatorios', relatoriosRouter)
app.use('/api/logs', logsRouter)

app.use(errorHandler)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
