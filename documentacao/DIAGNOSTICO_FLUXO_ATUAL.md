# Diagnóstico do Fluxo Atual — Módulo de Demandas/Pendências

## 1. Stack identificada
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + PostgreSQL (Fly.io)
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS (Vercel)
- **Auth**: JWT (8h), bcrypt, 2 papéis fixos: `MASTER` e `PADRAO`
- **Sem testes automatizados** (nenhum framework configurado, nenhum arquivo `*.test.*`/`*.spec.*`)
- **Sem CI configurado**

## 2. Documento de referência (conteúdo real extraído)
`documentacao/referenciais/Pendências _ Projetos ANTES FÉRIAS.docx` — planilha informal em texto corrido com ~17 processos. Padrão identificado em cada item:

- **GEP**: número/ano (ex: `126158/2025`), às vezes com "MFC" no lugar (`MFC 01698/2025`)
- **Interessado/loteamento**: Vila Elisa, Panorama, Naninhas do Bem, Vale do Amanhecer, Parque Imperial, Morada Guanabara, Senhorinha Cairo, Ituaçu, Jardim Valéria, Quadra 10, Sol Nascente, Morada Vitória, Ibirapuera...
- **Checklist recorrente**: Plantas, Memorial (descritivo), RRT/ART, Alvará, Certidão Informativa
- **Status por item**: OK / PENDENTE / PENDENTE DE ASSINATURA / PENDENTE DE CORREÇÃO
- **Responsáveis citados em texto livre**: Elaine, Raisa, Edvaldo, Cesar, Marcos, Paulo, Franklin, Debora, Jeferson, Laehithom
- **Dependências externas**: Seinfra (levantamento planimétrico), Patrimônio (avaliação imobiliária), Cartório (devolutivas pedindo plantas/memorial/ART/decreto)
- **Tipos de processo observados**: revalidação de alvará, retificação de área institucional, registro de área verde, desmembramento, doação de área, devolutiva de cartório
- **Anexos**: modelos de ofício formal de solicitação de alvará

Este documento confirma o padrão descrito no pedido original e será usado como referência de domínio — **não será importado para produção nesta fase**.

## 3. O que já existe no sistema e pode ser reaproveitado
O módulo "Tarefas" (recém-redesenhado nesta mesma sessão) já implementa o núcleo do conceito de demanda→atividade→checklist:
- `Tarefa` (processo) → `Etapa` (estágio) → `TarefaCard` (atribuição a um imóvel) → `Passo` (checklist com histórico por etapa, avançar/retornar)
- Toda movimentação já gera registro em `Ocorrencia` (histórico por imóvel)
- Já existe endpoint de log de auditoria (`Log` model) em toda ação sensível

**Decisão de arquitetura**: em vez de duplicar esse motor para "Demandas", a Fase 1 cria um modelo **Demanda/Atividade** paralelo e mais simples, focado no caso de uso real do documento (GEP + checklist fixo + responsável + status), reaproveitando o padrão de histórico já validado (Ocorrencia → equivalente `HistoricoDemanda`).

## 4. Limitações do sistema atual relevantes a este módulo
- Apenas 2 papéis fixos (MASTER/PADRAO) — não há equipes, nem papéis configuráveis, nem atribuição por perfil/equipe
- Não há central de notificações (nem in-app, nem e-mail)
- Não há versionamento de documentos (upload de documento é "descrição + link Drive", sem histórico de versão)
- Não há máquina de estados formal — mudanças de status seriam livres se não modeladas
- Sem testes automatizados: qualquer regressão precisa ser validada manualmente (via preview local e chamadas de API em produção, como fizemos nas features anteriores)

## 5. Escopo desta Fase 1 (aprovado pelo usuário)
Dado o tamanho do pedido completo (RBAC dinâmico, motor de workflow configurável, notificações, versionamento de documentos, auditoria imutável, 11 documentos de especificação, suíte de testes completa), foi acordado entregar uma **Fase 1 enxuta e funcional**, não o sistema completo de uma vez:

**Incluído na Fase 1:**
- Modelo de dados: `Demanda` (com GEP), `Atividade`, `PassoAtividade` (checklist), `HistoricoDemanda` (timeline imutável)
- Status controlados por transições válidas (não edição livre de status)
- Atribuição de atividade a um usuário responsável existente
- Fluxo: solicitante cria demanda → cria atividade → atribui responsável → responsável inicia → anexa observação/documento (link) → conclui → retorna ao solicitante → solicitante aprova ou devolve
- Timeline de histórico por demanda
- Tela de listagem de demandas + tela de detalhe com atividades e histórico
- Validação manual via API em produção (padrão já usado neste projeto, dado que não há suíte de testes)

**Explicitamente fora da Fase 1** (fica documentado como próximos passos):
- Perfis/equipes configuráveis pelo administrador (mantém MASTER/PADRAO por ora)
- Motor de modelos de fluxo configurável (fluxo fixo por enquanto)
- Central de notificações (in-app ou e-mail)
- Versionamento de documentos com upload real e hash de integridade (mantém padrão de link, como o resto do sistema)
- Pendências externas como módulo dedicado com lembretes de cobrança
- Importador assistido do DOCX
- Suíte de testes automatizados (não existe framework configurado no projeto; adicionar um está fora do escopo desta entrega, mas fica como recomendação)

## 6. Estratégia de migração
- Todas as tabelas novas (`Demanda`, `Atividade`, `PassoAtividade`, `HistoricoDemanda`) — **nenhuma tabela existente é alterada ou removida**
- Aplicado via `prisma db push` (padrão já usado neste projeto, sem migrations versionadas)
- Rollback: `DROP TABLE` das 4 tabelas novas reverte 100% sem afetar dados existentes (Imóveis, Ocorrências, Tarefas, Usuários intactos)
