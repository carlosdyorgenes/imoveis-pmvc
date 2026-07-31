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

## Explicitamente fora de escopo nas duas fases (ver `DIAGNOSTICO_FLUXO_ATUAL.md`)
- Perfis/permissões dinâmicos configuráveis pelo administrador (papéis continuam MASTER/PADRAO fixos)
- Motor de fluxo com condições, paralelismo real e dependências entre etapas
- Upload real de arquivo com hash de integridade (documentos continuam por link)
- Central de notificações por e-mail
- Testes de interface automatizados (Playwright/Cypress)
- Importador genérico de `.docx` via upload (a prévia atual é do documento de referência específico já analisado)

## Estado da branch
Todo o trabalho foi feito em `feature/novo-fluxo-demandas-imoveis`, mesclado em `main` após revisão, sem nenhuma alteração destrutiva em tabelas pré-existentes. Deploy em produção (Fly.io + Vercel) validado via testes funcionais reais após cada fase.
