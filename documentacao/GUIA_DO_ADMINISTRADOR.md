# Guia do Administrador (usuário MASTER) — Módulo de Demandas

## Configuração inicial recomendada

1. **Criar equipes** em `/equipes`: dê o nome (ex.: "Engenharia", "Parecer Jurídico", "Patrimônio") e adicione os usuários membros.
2. **Criar tipos de demanda** em `/tipos-demanda` (opcional, mas recomendado para processos repetitivos): defina o nome, prazo padrão em dias, e as etapas do fluxo. Diferente do que a primeira versão fazia, hoje **só a 1ª etapa nasce ao criar a demanda** — a 2ª só é criada quando a 1ª é aprovada, e assim por diante (dependência sequencial real, não tudo de uma vez).
3. **(Opcional) Criar Perfis de Acesso** em `/perfis`, se quiser que algum usuário PADRAO gerencie Equipes ou Tipos de Demanda sem virar Master. Crie o perfil, marque as permissões desejadas, e atribua-o ao usuário na mesma tela. Master continua tendo acesso total, com ou sem perfil.
4. Os usuários continuam sendo gerenciados em `/usuarios` (tela já existente, sem mudanças).

## Fluxo do dia a dia

- Em `/demandas`, clique em **Nova Demanda**, informe o GEP (obrigatório). Se o processo se encaixa em um tipo já modelado, selecione-o — as atividades da primeira etapa serão criadas automaticamente e notificadas à equipe/usuário responsável.
- Se não usar um tipo, crie a demanda e depois clique em **Nova Atividade** dentro dela para atribuir manualmente, a um usuário ou a uma equipe.
- Acompanhe a **linha do tempo** (lateral direita da tela de detalhe) para ver todo o histórico.
- Registre **pendências externas** (Seinfra, Patrimônio, Cartório) quando o andamento depender de terceiros — isso muda automaticamente o status da demanda para "Aguardando terceiro".
- Use o botão **Lista/Kanban** no topo de `/demandas` para alternar entre a tabela e um quadro visual por status.
- O **painel de indicadores** (topo de `/demandas`) mostra total de demandas, atrasadas, suas atividades pendentes e o que aguarda sua aprovação — atualiza sozinho a cada 60s.
- Demandas com prazo vencido são **escalonadas automaticamente**: você (e todos os Master) recebe uma notificação uma única vez por vencimento. Editar o prazo permite um novo alerta se vencer de novo.

## Como o administrador difere do MASTER

Neste módulo, "quem criou a demanda" (o solicitante) tem os poderes de gerenciamento daquela demanda específica (editar, atribuir atividades, aprovar/devolver) independentemente de ser MASTER ou PADRAO. O papel **MASTER** do sistema tem, além disso, um **override total**: pode agir em qualquer demanda/atividade de qualquer pessoa, e é o único que pode gerenciar Equipes, Tipos de Demanda, e confirmar a importação assistida do DOCX de pendências antigas.

## Importação assistida do documento de pendências antigo

Em vez de uma tela dedicada (não incluída nesta entrega), a prévia já extraída do documento de referência está disponível para qualquer MASTER via:

```
GET /api/demandas/importar/preview
```

Ela retorna os 17 processos identificados, cada um com um checklist sugerido e alertas (GEP incompleto, GEP duplicado no documento, responsável citado em texto livre sem usuário correspondente). Depois de revisar e corrigir manualmente (por exemplo, completar o ano de um GEP), envie os itens corrigidos para:

```
POST /api/demandas/importar/confirmar
{ "itens": [ { "gepNumero": "...", "gepAno": "...", "assunto": "...", ... } ] }
```

Itens sem GEP completo são **rejeitados automaticamente** (a resposta lista os rejeitados e o motivo) — isso é intencional, para não violar a regra de GEP obrigatório do sistema.

## Limitações a conhecer

- **Perfis de Acesso** cobrem hoje duas permissões (gerenciar Equipes, gerenciar Tipos de Demanda) — não é uma matriz granular por registro individual de demanda/atividade. Essas continuam via vínculo (solicitante/responsável/membro de equipe), que é validado no backend independentemente do perfil.
- O motor de fluxo é sequencial (uma etapa de cada vez); não há paralelismo real, condições nem desvios configuráveis entre etapas.
- Documentos podem ser **link do Google Drive OU upload real de arquivo** (PDF, DOC, XLS, imagem, DWG, ZIP — até 20MB, persistido no volume do Fly.io). O download de arquivo enviado exige login (não é um link público).
