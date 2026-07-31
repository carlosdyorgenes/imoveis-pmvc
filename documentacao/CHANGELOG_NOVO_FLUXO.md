# Changelog — Módulo de Demandas

## Fase 1 — Demanda, Atividade, Checklist, Timeline
- Modelo de dados: `Demanda` (GEP obrigatório) → `Atividade` (responsável, status) → `PassoAtividade` (checklist); `HistoricoDemanda` como timeline
- Máquinas de estado validadas no backend para Demanda e Atividade
- Fluxo completo: criar → atribuir → iniciar → concluir → aprovar/devolver
- Segurança endurecida numa iteração seguinte: só o responsável inicia/conclui, só o solicitante aprova/devolve, MASTER com override — validado com usuário PADRAO real
- Combobox de inscrição/imóvel/GEP consistente com o padrão já usado em Ocorrências e Tarefas
- `documentacao/DIAGNOSTICO_FLUXO_ATUAL.md` com o diagnóstico do sistema e o escopo acordado

## Fase 2 — Equipes, Notificações, Pendências Externas, Motor de Fluxo, Documentos, Importador, Testes
- **Equipes**: `Equipe`/`EquipeMembro`; atividade pode ser atribuída a uma equipe inteira (qualquer membro age como responsável)
- **Notificações in-app**: sino no menu lateral para todos os usuários; eventos: atividade atribuída/concluída/devolvida/aprovada
- **Pendências externas**: registro de dependência de terceiro (órgão/protocolo/prazo esperado), muda a demanda para "aguardando terceiro"
- **Motor de fluxo simplificado**: `TipoDemanda` + `ModeloEtapa` — ao criar uma demanda com um tipo selecionado, as atividades padrão são geradas automaticamente (com equipe e prazo, se definidos no modelo)
- **Documentos versionados**: `DocumentoAtividade` com incremento de versão por nome repetido na mesma atividade (mantém o padrão de link do resto do sistema)
- **Importador assistido do DOCX de pendências antigas**: prévia estruturada e real do documento de referência (17 processos, com alertas de GEP duplicado/incompleto), endpoint de confirmação seletiva que rejeita itens sem GEP completo — nada é importado automaticamente
- **Testes automatizados**: `vitest` configurado pela primeira vez no projeto; 13 testes cobrindo a máquina de estados e a integridade da prévia de importação
- Páginas novas: `/equipes`, `/tipos-demanda`; página de detalhe de demanda ganhou seções de documentos, pendências externas e atribuição por equipe

## Fase 3 — Comentários, Prazos/Atraso, Relatórios, Filtros
- **Comentários** (`Comentario`) por demanda, com menção simples `@Nome` que dispara notificação ao usuário mencionado
- **Indicador de atraso** (prazo vencido + status ativo) na listagem e no cabeçalho do detalhe da demanda
- **Relatórios de Demandas** (PDF/Excel) e atalho gerencial de demandas atrasadas, reaproveitando `pdfkit`/`exceljs` já usados no resto do sistema
- **Filtros avançados**: status, tipo de demanda, somente atrasadas (`GET /api/demandas` ganhou `tipoDemandaId`, `responsavelId`, `atrasadas`)

## Fase 4 — Documentos Versionados, Upload Real, Painel
- **Upload real de arquivo** (`multer`, volume persistente `/app/uploads` já montado no Fly.io) além do link do Drive — PDF, DOC, XLS, imagem, DWG, ZIP até 20MB
- **Download autenticado** (`GET /documentos/:id/arquivo`) — exige login, preserva o nome original no `Content-Disposition`
- Exclusão de documento remove também o arquivo físico do disco
- **Painel de indicadores** (`GET /api/demandas/painel/resumo`): total de demandas, atrasadas, minhas atividades pendentes, aguardando minha aprovação — widget no topo de `/demandas`

## Fase 5 — Escalonamento de Prazo, Kanban, Notificação Clicável
- **Escalonamento de prazo**: demanda vencida notifica solicitante + todos os MASTER uma única vez (`escalonado`, resetado ao editar o prazo); roda de forma "preguiçosa" nas rotas já consultadas periodicamente (sem cron dedicado)
- **Visualização Kanban** por status na listagem de demandas, alternável com a tabela
- Notificações agora navegam direto para a demanda relacionada ao clicar

## Motor de Fluxo Sequencial
- `Atividade.modeloEtapaId` rastreia de qual `ModeloEtapa` a atividade veio
- Ao criar demanda com `TipoDemanda`, só a 1ª etapa é criada; ao aprovar, a próxima nasce automaticamente (idempotente); ao aprovar a última, a demanda conclui sozinha
- Validado em produção com um tipo de 3 etapas: sequência completa A→B→C→conclusão automática, sem duplicar

## Testes de Interface (Playwright)
- Suíte E2E (`frontend/e2e/`) rodando contra o site real em produção (não localhost, por causa da política de CORS)
- 4 testes: login, criar demanda com GEP, aviso de GEP duplicado, comentário — todos passando
- Nova rota `DELETE /api/demandas/:id` (MASTER only) criada para permitir autolimpeza real dos dados de teste

## RBAC Dinâmico (Perfis)
- Novo model `Perfil` (nome + lista de permissões) atribuível a usuários PADRAO, **sem substituir** MASTER/PADRAO nem nenhuma autorização já validada — MASTER sempre passa, com ou sem perfil
- `requirePermissao(chave)`: middleware que libera se `role === MASTER` OU se o perfil do usuário contém a chave
- Rotas de gerenciar Equipes e Tipos de Demanda trocaram `requireMaster` por `requirePermissao`, então agora um PADRAO com o perfil certo também pode acessá-las
- Nova tela `/perfis`: criar perfis com checkboxes de permissão, atribuir perfil por usuário
- 5 testes unitários novos + validação end-to-end em produção (usuário PADRAO real criado e removido)

## Documentação (Etapa 27)
Os 11 arquivos de documentação pedidos foram entregues: `DIAGNOSTICO_FLUXO_ATUAL.md`, `ARQUITETURA_NOVO_FLUXO.md`, `MODELO_DE_DADOS.md`, `MATRIZ_DE_PERMISSOES.md`, `ESTADOS_E_TRANSICOES.md`, `PLANO_DE_MIGRACAO.md`, `PLANO_DE_ROLLBACK.md`, `GUIA_DO_ADMINISTRADOR.md`, `GUIA_DO_USUARIO.md`, `RELATORIO_DE_TESTES.md` e este changelog.

## O que continua fora de escopo (decisão consciente, não esquecimento)
- **Perfis com matriz granular por registro individual** — os Perfis desta entrega cobrem permissões de administração de módulo (Equipes, Tipos de Demanda); autorização por demanda/atividade individual continua via vínculo (solicitante/responsável/membro de equipe)
- **Motor de fluxo com paralelismo real, condições e desvios configuráveis** entre etapas — a dependência hoje é estritamente sequencial
- **Central de notificações por e-mail** — só in-app
- **Importador genérico de `.docx` via upload** — a prévia atual é do documento de referência específico já analisado, não um parser genérico
- **Hash de integridade formal para documentos** — upload real existe, mas sem verificação de integridade tipo checksum

## Estado da branch
Fase 1 foi feita em `feature/novo-fluxo-demandas-imoveis`, mesclada em `main` após revisão. Fases seguintes foram commitadas direto em `main`, a pedido do usuário. Nenhuma alteração destrutiva em tabelas pré-existentes em nenhuma fase. Deploy em produção (Fly.io + Vercel) validado via testes funcionais reais após cada fase — nunca só "no papel".
