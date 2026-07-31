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

`backend/src/middleware/auth.test.ts` — 5 testes (adicionados na entrega de RBAC dinâmico):
- MASTER libera mesmo sem a permissão explícita
- PADRAO com a permissão concedida pelo perfil é liberado
- PADRAO sem a permissão exigida é bloqueado
- PADRAO sem nenhum perfil atribuído é bloqueado
- Uma permissão não vaza para outra chave (ex.: perfil só com `equipes.gerenciar` não libera `tipos_demanda.gerenciar`)

**Resultado**: 3 arquivos de teste, 18 testes, todos passando (`vitest run`, ~250-430ms).

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

### Fase 3 — Comentários, prazos/atraso, relatórios, filtros
| Cenário | Resultado |
|---|---|
| Comentar na demanda | 201, texto correto |
| Relatório de Demandas (PDF) | 200, 1593 bytes |
| Relatório de Demandas (Excel) | 200, 6729 bytes |
| Relatório de Demandas Atrasadas (PDF) | 200 |
| Filtro `atrasadas=true` | Retornou só as demandas com prazo vencido |

### Fase 4 — Documentos versionados, upload real, painel
| Cenário | Resultado |
|---|---|
| Upload real de arquivo (multipart) | 201, arquivo salvo no volume persistente do Fly.io |
| Download sem token | 401 — bloqueado |
| Download com token | 200, `Content-Disposition` com o nome original correto |
| Excluir documento | Remove o registro **e** o arquivo físico (confirmado com 404 ao tentar baixar depois) |
| Painel de indicadores (`/painel/resumo`) | Contadores corretos (total, atrasadas, minhas pendentes, aguardando aprovação) |

### Fase 5 — Escalonamento de prazo, Kanban
| Cenário | Resultado |
|---|---|
| Demanda com prazo vencido, `GET /demandas` chamado | Notificação criada para solicitante + todos os MASTER |
| Chamar de novo (idempotência) | Não duplicou — só 1 evento de escalonamento no histórico |
| Editar o prazo | `escalonado` volta a `false` (novo alerta habilitado) |

### Motor de fluxo sequencial (após Fase 5)
| Cenário | Resultado |
|---|---|
| Criar tipo com 3 etapas, criar demanda | Só "Etapa A" nasceu |
| Aprovar "Etapa A" | "Etapa B" nasceu sozinha |
| Aprovar "Etapa B" | "Etapa C" nasceu sozinha |
| Aprovar "Etapa C" (última) | Demanda foi para `CONCLUIDA` automaticamente |
| Histórico | Exatamente 3 eventos de criação de atividade — sem duplicação |

### RBAC dinâmico (Perfis)
| Cenário | Resultado |
|---|---|
| MASTER acessa `/equipes` e cria equipe | 200 / 201 — sem regressão |
| Usuário PADRAO real, sem perfil, tenta criar equipe | 403 com mensagem indicando a permissão exigida |
| Cria perfil com `equipes.gerenciar`, atribui ao usuário | 200 |
| Mesmo usuário, agora com perfil, cria equipe | 201 |
| Mesmo usuário tenta gerenciar Tipos de Demanda (permissão não concedida) | 403 — a permissão não vazou entre módulos |
| MASTER continua criando Tipos de Demanda | 201 — sem regressão |

## Testes de interface automatizados (Playwright)

Ao contrário do que uma versão anterior deste relatório registrava, **testes E2E foram implementados e validados rodando de verdade** (`frontend/e2e/`, `npx playwright test`):

- **Suíte**: `demandas.spec.ts` — login, criar demanda com GEP, aviso de GEP duplicado sem bloquear, comentar na demanda
- **Onde rodam**: contra o **site real em produção** (`https://imoveis-pmvc.vercel.app`), não um mock — descoberto durante a implementação que `localhost` não autentica contra a API por causa do CORS (que só libera o domínio do Vercel), então os testes foram direcionados para lá em vez de enfraquecer essa política de segurança
- **Autolimpeza real**: os testes criam demandas com prefixo `E2E` no GEP e as removem via `DELETE /api/demandas/:id` (rota criada nesta mesma entrega) ao final de cada teste
- **Resultado final**: 4 de 4 testes passando (`npx playwright test`, ~1 minuto)

## O que ainda não foi testado (limitação assumida)

Teste de carga e teste de concorrência real (duas pessoas agindo na mesma atividade ao mesmo tempo) não foram feitos. Os testes E2E cobrem o caminho principal do módulo de Demandas — não há cobertura E2E para Imóveis/Ocorrências/Tarefas (módulos pré-existentes, fora do escopo desta entrega).
