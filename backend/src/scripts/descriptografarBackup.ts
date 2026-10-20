import path from 'path'
import { chaveDeBackup, descriptografarArquivo } from '../backup/criptografia'

// Restauração: baixe o arquivo .enc do Drive e rode (com a chave de backup no ambiente):
//   BACKUP_ENCRYPTION_KEY=<chave> node dist/scripts/descriptografarBackup.js <arquivo.enc> <saida>
// Para o banco, a saída é um dump do pg_dump; restaure com:
//   pg_restore --clean --if-exists --no-owner -d "<DATABASE_URL>" <saida>
// Para um anexo, a saída é o próprio arquivo original.
async function main() {
  const [origem, destino] = process.argv.slice(2)
  if (!origem || !destino) {
    console.error('Uso: descriptografarBackup <arquivo.enc> <arquivo-de-saida>')
    process.exit(1)
  }
  await descriptografarArquivo(path.resolve(origem), path.resolve(destino), chaveDeBackup())
  console.log(`Arquivo descriptografado em ${destino}`)
}

main().catch(e => {
  console.error('Falha ao descriptografar (chave errada ou arquivo corrompido):', e.message)
  process.exit(1)
})
