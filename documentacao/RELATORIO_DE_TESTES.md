# Relatório de Testes

O projeto não tinha nenhum framework de teste configurado antes deste módulo. Foram adicionados testes automatizados (`vitest`) para a lógica de domínio pura, e o restante foi validado por **testes funcionais reais contra a API de produção**, já que o backend não tem banco de testes isolado nem mocks de infraestrutura configurados.

## Testes automatizados (`npm test` no backend, via vitest)

`backend/src/domain/estados.test.ts` — 10 testes:
- Transição válida simples (`ABERTA -> EM_ANDAMENTO`)
- Bloqueio de pular etapa (`ABERTA -> CONCLUIDA`, `ATRIBUIDA -> CONCLUIDA`)
- Bloqueio de qualquer transição a partir de estados finais (`CONCLUIDA`, `CANCELADA`, `APROVADA`)
- Retomada de `AGUARDANDO_TERCEIRO -> EM_ANDAMENTO`
- Ciclo completo de aprovação (`ATRIBUIDA -> EM_ANDAMENTO -> CONCLUIDA -> APROVADA`)
- Ciclo de devolução e correção (`CONCLUIDA -> DEVOLVIDA -> EM_ANDAMENTO -> CONCLUIDA`)
- Ausência de sobreposição entre ações do responsável e do solicitante

`backend/src/data/previewImportacao.test.ts` — 3 testes:
- Todo item sem GEP completo carrega um alerta explicando o motivo
- GEPs duplicados no documento de referência (linha 10 "Janete" e linha 11 "Homero", ambos GEP 51823/2023) estão sinalizados nos dois lados
- Nenhum item importável está sem assunto

**Resultado**: 2 arquivos de teste, 13 testes, todos passando (`vitest run`, ~250ms).

## Validação funcional em produção (executada nesta sessão, dados de teste sempre removidos ao final)

### Fase 1 — fluxo básico de Demanda/Atividade
| Cenário | Resultado |
|---|---|
| Criar demanda com GEP | 201, dados corretos |
| Criar demanda com GEP já existente | Aviso retornado, não bloqueou (`avisoGepDuplicado`) |
| Transição inválida direta (`ABERTA -> CONCLUIDA`) | 400, rejeitado |
| Criar atividade → demanda muda para `EM_ANDAMENTO` | Confirmado |
| Concluir com passo pendente e sem motivo | 400, rejeitado com contagem de pendentes |
| Marcar passo, concluir de novo | 200, sucesso |
| Devolver sem motivo | 400, rejeitado |
| Devolver com motivo, corrigir, concluir, aprovar | Ciclo completo funcionou |
| Timeline (`historico`) | Todos os 8 eventos registrados na ordem correta |

### Segurança de autorização (usuário PADRAO real criado para o teste)
| Cenário | Resultado |
|---|---|
| Usuário sem vínculo tenta atribuir atividade | 403 |
| Responsável conclui sua própria atividade | 200 |
| Responsável (não-solicitante) tenta aprovar | 403 |
| MASTER tenta qualquer ação (override) | 200 em todas |

### Fase 2 — equipes, motor de fluxo, notificações, documentos
| Cenário | Resultado |
|---|---|
| Criar equipe e adicionar membro | 201 |
| Criar tipo de demanda com 2 etapas (uma com equipe padrão) | 201 |
| Criar demanda com esse tipo | 2 atividades geradas automaticamente; demanda passou para `EM_ANDAMENTO`; prazo calculado a partir do `prazoPadraoDias` (30 dias) |
| Membro da equipe (sem ser `responsavelId` direto) inicia a atividade da equipe | 200 — autorização por membership de equipe funcionando |
| Notificação enviada ao criar a atividade atribuída à equipe | Confirmada na caixa do membro (`ATIVIDADE_ATRIBUIDA`) |
| Anexar o mesmo nome de documento duas vezes na mesma atividade | v1, depois v2 (versionamento incrementando corretamente) |
| Endpoints novos (`/equipes`, `/tipos-demanda`, `/notificacoes/count`, `/demandas/importar/preview`) | Todos respondendo em produção |

## O que não foi testado (limitação assumida)

Testes de interface (Playwright/Cypress) não foram criados — a validação de UI foi feita via typecheck (`tsc --noEmit`, zero erros nas duas fases) e inspeção do preview local para as telas novas (renderização sem erro de console). Não há teste de carga, nem teste de concorrência (duas pessoas agindo na mesma atividade ao mesmo tempo).
