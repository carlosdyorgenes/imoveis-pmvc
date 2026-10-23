import { prisma } from '../lib/prisma'

// Recupera as atualizações do relatório gerado HOJE, que tinham sido consumidas pela regra
// antiga (cada geração zerava as atualizações). Uso, no servidor:
//   node dist/scripts/recuperarBaseRelatorio.js --anterior=2026-10-17T21:00:00Z           (simulação)
//   node dist/scripts/recuperarBaseRelatorio.js --anterior=2026-10-17T21:00:00Z --aplicar
// Demandas refeitas hoje voltam a aparecer como atualizadas desde o relatório anterior; as
// demais ficam com a base no estado atual. Só mexe em linhas ainda sem base gravada.
async function main() {
  const anteriorArg = process.argv.find(a => a.startsWith('--anterior='))?.split('=')[1]
  const aplicar = process.argv.includes('--aplicar')
  const anterior = anteriorArg ? new Date(anteriorArg) : null
  if (!anterior || isNaN(anterior.getTime())) {
    console.error('Informe --anterior=<data/hora ISO do relatório anterior>')
    process.exit(1)
  }

  const dataBr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const hoje = dataBr(new Date())
  const linhas = await prisma.relatorioGeralCache.findMany({
    where: { baseAssinatura: null },
    include: { demanda: { select: { gepNumero: true, gepAno: true, status: true } } },
  })

  let recuperadas = 0
  let mantidas = 0
  for (const l of linhas) {
    const geradaHoje = dataBr(l.atualizadoEm) === hoje
    const rotulo = `GEP ${l.demanda.gepNumero}/${l.demanda.gepAno} (${l.demanda.status})`
    if (geradaHoje) {
      recuperadas++
      console.log(`  atualizada -> ${rotulo}`)
      if (aplicar) {
        await prisma.relatorioGeralCache.update({
          where: { id: l.id },
          data: { baseAssinatura: '__RECUPERADO__', baseAssinaturaAnexos: null, baseEm: anterior, atualizadoEm: l.atualizadoEm },
        })
      }
    } else {
      mantidas++
      if (aplicar) {
        await prisma.relatorioGeralCache.update({
          where: { id: l.id },
          data: { baseAssinatura: l.assinatura, baseAssinaturaAnexos: l.assinaturaAnexos, baseEm: l.atualizadoEm, atualizadoEm: l.atualizadoEm },
        })
      }
    }
  }
  console.log(`\n${aplicar ? 'APLICADO' : 'SIMULAÇÃO'}: ${recuperadas} demanda(s) voltam como atualizadas; ${mantidas} ficam sem atualização.`)
  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
