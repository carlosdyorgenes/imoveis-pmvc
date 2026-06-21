import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma'

async function main() {
  const password = await bcrypt.hash('admin123', 10)
  await prisma.user.upsert({
    where: { email: 'admin@pmvc.gov.br' },
    update: {},
    create: { name: 'Administrador', email: 'admin@pmvc.gov.br', password, role: 'MASTER' }
  })
  console.log('Seed concluído. Login: admin@pmvc.gov.br / admin123')
}

main().finally(() => prisma.$disconnect())
