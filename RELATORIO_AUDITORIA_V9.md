# Relatório de Auditoria — AcadeConnect / Mustangs Atlética **V9**

**Objetivo:** encontrar e corrigir a causa real da lentidão sob alto número de acessos simultâneos, **sem alterar layout, identidade visual ou funcionalidades**.

**Escopo auditado:** frontend (React + Vite), backend (Node + Express), banco (PostgreSQL + Prisma), concorrência, cache, HTTP, polling, índices, processamento assíncrono.

**Restrições respeitadas:**
- Nenhuma alteração de layout/cores/fontes/menus/componentes visuais.
- Nenhuma migração destrutiva (`DROP`/`TRUNCATE`/reset/`db push`) e **nenhuma perda de dados**.
- Todas as migrações novas são **aditivas**.
- Nenhuma funcionalidade existente removida.

> Observação de honestidade técnica: o ambiente desta análise **não possuía PostgreSQL**, então não foi possível executar carga real contra o banco. Latência/throughput aparecem como **“não medido”** no relatório de performance. O que foi medido (build, unit tests, contagem de consultas por leitura de código, tamanho de bundle) está marcado como medido.

---

## 1. Diagnóstico — causa raiz do gargalo

A lentidão sob concorrência **não era causada por “servidor fraco”**. A auditoria identificou seis causas combinadas:

| # | Causa raiz | Evidência |
|---|-----------|-----------|
| A | **Polling agressivo de mensagens.** `useLiveConversation` refazia `GET /conversations/:id` a cada **5s**, recebendo a **thread inteira** a cada chamada. | `frontend/src/hooks/useLiveConversation.js` (v8) |
| B | **Consultas repetidas e idênticas** em endpoints públicos (eventos, loja, resultados de sorteio) e no dashboard, sem cache. | `eventController.listEvents`, `productService`, `raffleService`, `adminController.dashboard` |
| C | **N+1 / operações em lote feitas uma a uma**: notificação de todos os inscritos de um evento, todos os admins, emissão massiva de certificados. | `eventController.updateEvent`, `conversationService.sendMessage`, `certificateService.autoIssueCertificatesForEvent` |
| D | **Falta de índices** para os filtros/ordenações mais usados (`eventId+status`, `createdAt`, `userId+read`, `conversationId+createdAt`, `status+expiresAt`…). | `schema.prisma` (v8) |
| E | **Consultas sem paginação/limite** (listas que crescem indefinidamente). | vários `findMany()` sem `take` |
| F | **Condições de corrida** em vagas de inscrição e geração de PIX sob concorrência. | `registrationController.registerForEvent`, `paymentService.createPayment` |

Cada item foi corrigido. Detalhes abaixo.

---

## 2. Correções aplicadas

### 2.1 Frontend — fim do polling pesado (Prioridade 1/3)

| Problema | Causa | Impacto | Correção |
|---|---|---|---|
| Thread re-baixada a cada 5s | `useLiveConversation` chamava `GET /conversations/:id` completo | `200 usuários × 12 req/min = ~2.400 req/min`, cada uma retornando a conversa inteira | Refresh **incremental** (`GET /conversations/:id/messages?since=ISO`, só mensagens novas) + **intervalo adaptativo** (5s com atividade → até 60s sem atividade) + **pausa em aba oculta** + **refresh imediato ao voltar o foco** |
| Latência de novas mensagens | dependia do próximo tick | até 5s de atraso | **SSE** (`EventSource`): mensagem nova aparece na hora, sem polling |
| Polling duplicado por componente | cada componente abria o próprio timer | múltiplas chamadas simultâneas | Cliente SSE **singleton** (`frontend/src/api/realtime.js`), 1 conexão por aba |
| Badge de não lidas | `setInterval` 60s | 1 req/min por usuário logado | Atualização via SSE + fallback lento (120s, pausado em aba oculta) + refresh no foco |
| Reload completo em erro | `window.location.reload()` nos botões “tentar novamente” | recarregava toda a SPA | passou a usar o `reload` do próprio hook (`Home`, `AdminEventoForm`) |

### 2.2 Backend — SSE (Server-Sent Events)

- `backend/src/services/realtime.js`: hub pub/sub em processo (EventEmitter).
- `backend/src/controllers/realtimeController.js` + `routes/realtime.routes.js`:
  - `POST /api/realtime/token` → token **curto (2 min) e com escopo `purpose: stream`** (não expõe o JWT de sessão na URL);
  - `GET /api/realtime/stream?token=...` → stream SSE com heartbeat de 25s e limpeza no `close`.
- Notificações e mensagens publicam em tempo real (payload mínimo: id/tipo).
- **Limitação documentada:** entrega em processo. Com 1 instância (Render) cobre todos os usuários. Em escala horizontal seria necessário um broker compartilhado (Redis pub/sub); até lá, o **polling otimizado de fallback mantém a correção** do estado.

### 2.3 Backend — banco / Prisma / pool (Prioridade 2)

| Problema | Correção |
|---|---|
| PrismaClient sem parâmetros de pool, risco de múltiplas instâncias em hot-reload | `config/prisma.js`: instância única (cache em `globalThis`), **pool explícito e configurável** (`connection_limit`, `pool_timeout`, `connect_timeout`), warmup no boot e desconexão limpa |
| Nenhum diagnóstico de consulta lenta | log de query lenta **opt-in** (`PRISMA_LOG_QUERIES`) por limiar (`PRISMA_SLOW_QUERY_MS`) |
| Falta de índices | **29 índices** aditivos (ver §3) |

> ⚠️ Não aumentamos `connection_limit` às cegas. O padrão é **10** e há aviso explícito: medir antes de elevar; um pool grande tende a piorar o problema.

### 2.4 Backend — N+1 e agregações (Prioridade 4)

| Problema | Causa | Correção |
|---|---|---|
| Notificar todos os inscritos de um evento | um `INSERT` + round-trip por usuário | `createNotifications()` → **um `createMany`** (`notificationService.js`); usado em `eventController.updateEvent` e `conversationService.sendMessage` |
| Notificar todos os admins de nova mensagem | idem | bulk insert com lista buscada 1 vez |
| Relatório carregava **todas** as inscrições + presenças para somar em JS | `reportController` | agregados no **banco** (`count`, `groupBy`) |
| Resumo de presença por evento carregava todas as presenças de todas as atividades | `attendanceController.eventAttendanceSummary` | `groupBy` + projeção de 2 colunas |
| Emissão massiva de certificados: 1 consulta pesada por participante | `autoIssueCertificatesForEvent` | elegibilidade em lote (já existia) + carga das inscrições em **lotes de 50** com um helper que não re-consulta; email do usuário reaproveitado (elimina `user.findUnique` extra por certificado) |

### 2.5 Backend — paginação / limites (Prioridade 5)

Limites aplicados a listas que cresciam sem limite:
`registrations/me`, `certificates/me`, `payments/mine`, `orders/mine`, `products` (público/admin), `raffles` + resultados públicos, `conversations` (minhas/admin), mensagens da conversa (**últimas 200**, ordem crescente), atividades por evento.
Comentários claros no código e defaults generosos para **não alterar a experiência atual**.

### 2.6 Backend — concorrência (Prioridade 6)

| Fluxo | Risco | Correção |
|---|---|---|
| Inscrição em evento/atividade | dois usuários pegando a última vaga | checagem + INSERT em **transação `Serializable`** com **retry em conflito (P2034)** |
| PIX (evento/pedido) | dois requests simultâneos criando dois pagamentos | reuse/regeneração + captura de **P2002** devolvendo o pagamento já criado (**idempotente**) |
| Pedido/estoque | venda dupla | já era transacional com decremento condicional (`stock >= qty`) — **preservado** |
| Sorteio | vencedor duplicado | transação + índice único — **preservado** |

### 2.7 Backend — cache (Prioridade 7)

`backend/src/utils/cache.js`: cache TTL em memória com **single-flight** (rajada de requisições idênticas dispara **1** consulta) e invalidação por prefixo.

Aplicado a: lista/detalhe público de eventos, loja (produtos ativos), resultados públicos de sorteio, dashboard administrativo.
**Nunca** é usado para dado privado por usuário (autorização continua exata).
Invalidação explícita em toda escrita relacionada.

### 2.8 Backend — HTTP / infra (Prioridade 9)

- **gzip** (`compression`) para JSON/texto, **excluindo SSE** (não pode ser bufferizado).
- **ETag fraco** + `Cache-Control` agressivo para `/uploads` (nomes são hashes imutáveis).
- **CORS preflight cacheado** (`maxAge: 600`) — elimina metade dos requests em setup cross-origin (Vercel → Render).
- **Keep-alive** ajustado (`keepAliveTimeout`/`headersTimeout`) para o proxy do Render.
- **Health check** sem tocar o banco e **fora do rate limit**.
- **Rate limit em camadas**: global (padrão elevado para 600/15min, para não bloquear NAT/campus), `authLimiter`, **`heavyLimiter`** (exports, certificados, pedidos, PIX, inscrição) e `streamLimiter` (abertura de SSE).
- **Graceful shutdown** + handlers de `unhandledRejection`/`uncaughtException`.
- **Cache curto do usuário autenticado** (5s, invalidado em escritas) — remove a consulta de auth repetida em **todo** request protegido.

### 2.9 O que **não** foi alterado

- Layout, identidade visual, cores, fontes, menus, logos, componentes e estrutura de páginas.
- Fluxo e correções de **QR de presença**, **PIX** (EMV/CRC/chave/validade/regeneração), **sorteio**, **inscrições**, **certificados**, **pedidos**, **mensagens** (comportamento).
- Segurança: autenticação, autorização/RBAC, ownership (anti-IDOR), validação, hash de senha.

---

## 3. Migração de banco (aditiva)

`backend/prisma/migrations/20260916000000_add_performance_indexes/migration.sql`

- **Somente `CREATE INDEX IF NOT EXISTS`** por 29 índices. Zero `DROP`/`TRUNCATE`/`DELETE`/alteração de coluna/tabela.
- Idempotente e segura em banco populado.
- Nomes conferidos contra o SQL gerado pelo próprio Prisma (`prisma migrate diff --from-empty --to-schema-datamodel`) — **29/29 batem**.

Índices por motivo (resumo): Evento (`deletedAt+status`, `deletedAt+createdAt`, `startDate`), Inscrição (`eventId+status`, `createdAt`, `eventId+createdAt`), Atividade (`eventId+date`), InscriçãoAtividade (`activityId+status`), Presença (`eventId`, `eventId+recordedAt`), Certificado (`eventId`, `userId+issueDate`), Notificação (`userId+read`, `userId+createdAt`), Auditoria (`userId`), Pagamento (`status+expiresAt`, `createdAt`, `userId+createdAt`), Produto (`status+deletedAt`, `status+featured`), Cupom (`active+deletedAt`), Pedido (`createdAt`, `userId+createdAt`), Conversa (`lastMessageAt`, `userId+lastMessageAt`), Mensagem (`conversationId+createdAt`, `conversationId+readAt`), Sorteio (`createdAt`), Usuário (`createdAt`).

---

## 4. Arquivos alterados / criados

**Novos (7):**
```
backend/src/utils/cache.js
backend/src/services/realtime.js
backend/src/controllers/realtimeController.js
backend/src/routes/realtime.routes.js
backend/scripts/test-performance.mjs
frontend/src/api/realtime.js
backend/prisma/migrations/20260916000000_add_performance_indexes/migration.sql
```

**Alterados (35):** backend (config, app, server, middlewares, 11 controllers, 7 services, 2 utils, 3 routes), frontend (api/services, api/realtime, hooks/useLiveConversation, layouts/DashboardLayout, components/Header, pages/Home, pages/admin/AdminEventoForm).
Lista exata disponível no diff `CORRECOES_V9.diff`.

---

## 5. Riscos residuais e recomendações

1. **Emissão massiva de certificados** permanece síncrona (gera PDF por participante). O custo de banco foi reduzido a lotes, mas a geração de PDF ainda é a parte pesada. Para eventos muito grandes, recomenda-se um **job em background** (fila) — fora do escopo desta correção e sem quebra do fluxo atual.
2. **SSE em múltiplas instâncias** exigirá broker compartilhado (Redis pub/sub). Com 1 instância (Render) funciona integralmente; o fallback de polling cobre o resto.
3. **Uploads em disco local** continuam efêmeros em Render — migrar para S3/Cloudinary (`UPLOAD_DIR`/`UPLOADS_BASE_URL` já preparados).
4. **E-mail** desativado (`EMAIL_ENABLED=false`) — recuperação de senha/certificado só no console.
5. `connection_limit` deve ser **medido**, não elevado por palpite.
