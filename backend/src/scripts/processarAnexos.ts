import { prisma } from '../lib/prisma'
import { processarAnexo, ResultadoProcessamento } from '../utils/anexos'

// Carga inicial da leitura de anexos. Uso (no servidor):
//   node dist/scripts/processarAnexos.js --dry-run   -> só classifica e estima, sem IA e sem gravar
//   node dist/scripts/processarAnexos.js             -> lê e grava (chama IA onde necessário)
// Retomável: o que já foi lido é pulado; erros ficam registrados e são tentados de novo.
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const documentos = await prisma.documentoAtividade.findMany({
    where: { arquivoPath: { not: null } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, nome: true },
  })
  console.log(`${dryRun ? '[SIMULAÇÃO] ' : ''}${documentos.length} arquivo(s) anexado(s) a processar`)

  const contagem: Record<string, number> = {}
  const motivos: Record<string, number> = {}
  let chamadasIA = 0
  let i = 0
  for (const d of documentos) {
    i++
    let r: ResultadoProcessamento
    try {
      r = await processarAnexo(d.id, { dryRun })
    } catch (e) {
      r = { acao: 'ERRO', motivo: e instanceof Error ? e.message : 'erro', chamadasIA: 0 }
    }
    contagem[r.acao] = (contagem[r.acao] || 0) + 1
    if (r.motivo) motivos[`${r.acao}: ${r.motivo}`] = (motivos[`${r.acao}: ${r.motivo}`] || 0) + 1
    chamadasIA += r.chamadasIA
    if (i % 20 === 0) console.log(`  ... ${i}/${documentos.length}`)
  }

  console.log('\nResultado por ação:')
  Object.entries(contagem).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`))
  if (Object.keys(motivos).length > 0) {
    console.log('Detalhes:')
    Object.entries(motivos).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`))
  }
  console.log(`\nChamadas de IA ${dryRun ? 'previstas' : 'realizadas'}: ${chamadasIA}`)
  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
