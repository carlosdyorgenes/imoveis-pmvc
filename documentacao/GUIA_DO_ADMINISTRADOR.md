# Guia do Administrador (usuário MASTER) — Módulo de Demandas

## Configuração inicial recomendada

1. **Criar equipes** em `/equipes`: dê o nome (ex.: "Engenharia", "Parecer Jurídico", "Patrimônio") e adicione os usuários membros.
2. **Criar tipos de demanda** em `/tipos-demanda` (opcional, mas recomendado para processos repetitivos): defina o nome, prazo padrão em dias, e as etapas do fluxo — cada etapa vira uma atividade criada automaticamente, atribuída à equipe que você escolher.
3. Os usuários continuam sendo gerenciados em `/usuarios` (tela já existente, sem mudanças).

## Fluxo do dia a dia

- Em `/demandas`, clique em **Nova Demanda**, informe o GEP (obrigatório). Se o processo se encaixa em um tipo já modelado, selecione-o — as atividades da primeira etapa serão criadas automaticamente e notificadas à equipe/usuário responsável.
- Se não usar um tipo, crie a demanda e depois clique em **Nova Atividade** dentro dela para atribuir manualmente, a um usuário ou a uma equipe.
- Acompanhe a **linha do tempo** (lateral direita da tela de detalhe) para ver todo o histórico.
- Registre **pendências externas** (Seinfra, Patrimônio, Cartório) quando o andamento depender de terceiros — isso muda automaticamente o status da demanda para "Aguardando terceiro".

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

- Não há tela de "matriz de permissões" configurável — os papéis continuam sendo MASTER/PADRAO fixos, e a autorização dentro de uma demanda vem do vínculo (solicitante/responsável/membro de equipe).
- O motor de fluxo gera todas as atividades do tipo de uma vez (não há dependência sequencial automática entre elas).
- Documentos continuam sendo links do Google Drive, não upload de arquivo.
