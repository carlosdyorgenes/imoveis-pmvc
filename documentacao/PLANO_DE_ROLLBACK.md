# Plano de Rollback

## Rollback de código

```bash
git log --oneline  # localizar o commit anterior ao módulo de Demandas
git revert <hash-do-commit>   # ou reset se ainda não houver push adicional por cima
git push origin main
```

Como o backend builda a partir do `main` a cada `flyctl deploy`, revertendo o código e re-deployando o backend volta ao comportamento anterior. As rotas novas (`/api/demandas`, `/api/equipes`, `/api/tipos-demanda`, `/api/notificacoes`) simplesmente deixam de existir; nada nas rotas antigas (`imoveis`, `ocorrencias`, `tarefas`) foi alterado por este módulo.

## Rollback de schema (banco de dados)

**Importante**: como o projeto usa `prisma db push` (não migrations versionadas), não existe um comando `prisma migrate down`. O rollback de schema é feito por SQL direto, exatamente como foi feito para limpar dados de teste durante o desenvolvimento (via `flyctl ssh console` + `prisma db execute`).

### Reversão completa do módulo (remove todas as tabelas novas das Fases 1 e 2)

```sql
DROP TABLE IF EXISTS "notificacoes" CASCADE;
DROP TABLE IF EXISTS "pendencias_externas" CASCADE;
DROP TABLE IF EXISTS "documentos_atividade" CASCADE;
DROP TABLE IF EXISTS "modelo_etapas" CASCADE;
DROP TABLE IF EXISTS "tipos_demanda" CASCADE;
DROP TABLE IF EXISTS "equipe_membros" CASCADE;
DROP TABLE IF EXISTS "equipes" CASCADE;
DROP TABLE IF EXISTS "passos_atividade" CASCADE;
DROP TABLE IF EXISTS "historico_demandas" CASCADE;
DROP TABLE IF EXISTS "atividades" CASCADE;
DROP TABLE IF EXISTS "demandas" CASCADE;
```

Executar via:
```bash
flyctl ssh console --app imoveis-pmvc-api --command "sh -c 'echo \"<SQL ACIMA>\" | npx prisma db execute --url \"\$DATABASE_URL\" --stdin'"
```

Depois, reverter o schema.prisma para a versão anterior e rodar `npx prisma generate` + novo deploy, para que o Prisma Client volte a corresponder ao banco.

### Reversão apenas da Fase 2 (mantém Demanda/Atividade/Passo/Histórico da Fase 1)

```sql
DROP TABLE IF EXISTS "notificacoes" CASCADE;
DROP TABLE IF EXISTS "pendencias_externas" CASCADE;
DROP TABLE IF EXISTS "documentos_atividade" CASCADE;
DROP TABLE IF EXISTS "modelo_etapas" CASCADE;
DROP TABLE IF EXISTS "tipos_demanda" CASCADE;
DROP TABLE IF EXISTS "equipe_membros" CASCADE;
DROP TABLE IF EXISTS "equipes" CASCADE;
ALTER TABLE "atividades" DROP COLUMN IF EXISTS "equipeId";
ALTER TABLE "demandas" DROP COLUMN IF EXISTS "tipoDemandaId";
ALTER TABLE "atividades" ALTER COLUMN "responsavelId" SET NOT NULL;
```

⚠️ O último `ALTER COLUMN ... SET NOT NULL` falha se existir alguma atividade atribuída a uma equipe (sem `responsavelId`). Nesse caso, reatribua manualmente essas atividades a um usuário antes de rodar o rollback parcial.

## O que NÃO é afetado por nenhum destes rollbacks

Tabelas do restante do sistema: `users`, `imoveis`, `documentos`, `ocorrencias`, `tarefas`, `etapas`, `tarefa_cards`, `passos`, `solicitacoes_senha`, `logs`. Nenhuma tem foreign key para as tabelas deste módulo.

## Backup antes de qualquer rollback em produção

```bash
flyctl postgres connect --app imoveis-pmvc-db
# ou, para dump completo:
flyctl ssh console --app imoveis-pmvc-api --command "pg_dump \$DATABASE_URL > /tmp/backup_pre_rollback.sql"
```
