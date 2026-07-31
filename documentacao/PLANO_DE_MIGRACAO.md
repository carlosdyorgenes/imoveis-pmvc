# Plano de Migração

## Estratégia geral usada nas duas fases

Este projeto **não usa migrations versionadas do Prisma** (`prisma migrate`) — usa `prisma db push`, aplicado automaticamente no `CMD` do Dockerfile do backend a cada deploy (`npx prisma db push --skip-generate && node dist/server.js`). Isso já era o padrão do sistema antes deste módulo, mantido por consistência.

Todas as alterações de schema deste módulo foram **estritamente aditivas**:

| Fase | Tabelas criadas | Tabelas alteradas | Tabelas removidas |
|---|---|---|---|
| Fase 1 (Demandas básico) | `demandas`, `atividades`, `passos_atividade`, `historico_demandas` | Nenhuma | Nenhuma |
| Fase 2 (Equipes/Notificações/Fluxo/Pendências) | `equipes`, `equipe_membros`, `tipos_demanda`, `modelo_etapas`, `documentos_atividade`, `pendencias_externas`, `notificacoes` | `atividades` (campo `responsavelId` passou de obrigatório para opcional; adicionados `equipeId`), `demandas` (adicionado `tipoDemandaId`) | Nenhuma |

A alteração de `responsavelId` para opcional é **compatível com dados existentes**: nenhuma atividade criada na Fase 1 tinha `equipeId`, então todas continuam válidas com `responsavelId` preenchido.

## Passo a passo executado

1. Editar `backend/prisma/schema.prisma`
2. `npx prisma generate` (local, para o TypeScript enxergar os novos tipos)
3. `npx tsc --noEmit` (typecheck) e `npx vitest run` (testes) antes de qualquer deploy
4. Commit na branch `feature/novo-fluxo-demandas-imoveis`, depois merge para `main` (nunca commitado direto em `main`)
5. `git push origin main`
6. `flyctl deploy --remote-only` — o `db push` roda automaticamente no boot do container
7. `vercel deploy --prod` para o frontend
8. Validação funcional real via chamadas HTTP à API de produção (login → criar recurso de teste → exercitar as regras → limpar os dados de teste)

## Dados existentes no momento da migração

Ao aplicar a Fase 1, já existia 1 demanda real criada pelo usuário durante os testes manuais da funcionalidade (GEP 12352/2026 — Vila Elisa). Ela **não foi afetada** por nenhuma das mudanças de schema subsequentes.

## Rollback

Ver `PLANO_DE_ROLLBACK.md` para o procedimento e o SQL exato.
