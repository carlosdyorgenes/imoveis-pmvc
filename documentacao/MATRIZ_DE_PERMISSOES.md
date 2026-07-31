# Matriz de Permissões — Módulo de Demandas

O sistema mantém os dois papéis já existentes (`MASTER`, `PADRAO`) — **não foi criado um sistema de perfis dinâmicos configuráveis** nesta entrega (ver `DIAGNOSTICO_FLUXO_ATUAL.md`, Etapa 3 do escopo original ficou fora da Fase 1/2). Dentro de um mesmo papel PADRAO, a autorização real vem do **vínculo com o recurso** (solicitante, responsável, membro de equipe), validado sempre no backend.

## Regra geral

`MASTER` tem override administrativo em toda ação deste módulo. As linhas abaixo descrevem o comportamento para `PADRAO`.

| Ação | Quem pode (backend valida) | Rota |
|---|---|---|
| Criar demanda | Qualquer usuário autenticado | `POST /api/demandas` |
| Editar demanda (assunto/descrição/prazo) | Somente o **solicitante** da demanda | `PUT /api/demandas/:id` |
| Mudar status da demanda | Somente o **solicitante** | `PUT /api/demandas/:id/status` |
| Atribuir atividade (a usuário ou equipe) | Somente o **solicitante** da demanda | `POST /api/demandas/:id/atividades` |
| Remover atividade | Somente quem **criou a atividade** | `DELETE /api/demandas/atividades/:id` |
| Iniciar atividade (`EM_ANDAMENTO`) | Somente o **responsável** (usuário ou membro da equipe) | `PUT /atividades/:id/status` |
| Concluir atividade (`CONCLUIDA`) | Somente o **responsável** | idem |
| Aprovar atividade (`APROVADA`) | Somente o **solicitante da atividade** | idem |
| Devolver atividade (`DEVOLVIDA`) | Somente o **solicitante da atividade** | idem |
| Cancelar atividade | Responsável **ou** solicitante | idem |
| Gerenciar checklist (criar/marcar/remover passo) | Responsável, solicitante da atividade | `/passos/*` |
| Anexar/remover documento da atividade | Responsável, solicitante da atividade | `/documentos/*` |
| Registrar pendência externa | Qualquer usuário autenticado | `POST /:id/pendencias` |
| Criar/editar Equipe, gerenciar membros | **Somente MASTER** | `equipes.routes.ts` |
| Criar/editar Tipo de Demanda e suas etapas-modelo | **Somente MASTER** | `tiposDemanda.routes.ts` |
| Pré-visualizar/confirmar importação do DOCX | **Somente MASTER** | `/importar/*` |
| Ler notificações próprias | Qualquer usuário, apenas as suas | `notificacoes.routes.ts` |

## Onde isso é validado

Toda checagem acima está na camada de rota (backend), não apenas escondendo botão no frontend — validado com teste real em produção usando um usuário PADRAO criado especificamente para o teste (ver seção de validação no histórico da conversa / `RELATORIO_DE_TESTES.md`). O frontend também esconde as ações que seriam rejeitadas, para não expor um botão que sempre daria erro 403 — mas isso é só UX, a garantia de segurança é o backend.

## Limitação conhecida

Não existe hoje "permissão granular por recurso" configurável pelo administrador (ex.: "fulano só pode editar demandas do tipo X"). A autorização é por **papel fixo** (MASTER) ou por **vínculo direto** (solicitante/responsável/membro de equipe) — não por uma matriz de permissões editável em tela, que era o pedido original da Etapa 3 completa.
