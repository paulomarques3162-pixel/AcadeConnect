# RELATÓRIO DE ESCALABILIDADE — ACADECONNECT V9.2

**Objetivo:** preparar o AcadeConnect para picos de até **500 usuários simultâneos** (com foco em login simultâneo), **sem alterar o layout** e **sem destruir/alterar dados**.

**Regra de preservação visual:** nenhum arquivo de estilo, componente visual, rota, texto ou estrutura de página foi modificado.

```
LAYOUT PRESERVADO = SIM
```

As alterações são exclusivamente de backend, banco (índices), cache, conexão, autenticação, rate limiting, realtime, observabilidade e eficiência de requisições. A única mudança no frontend foi **interna** (`LiveDataContext` passa a usar um endpoint agregado) — não há mudança de aparência, DOM estrutural, CSS ou comportamento visível.

---

## 1. Estado anterior (V9.1)

A V9.1 já tinha resolvido boas partes do problema:

- SSE singleton (1 aba → 1 conexão) e Store central de contadores (`LiveDataContext`);
- polling consciente do SSE e *backoff*;
- cache em memória com single-flight (`utils/cache.js`);
- `ETag` fraco + gzip;
- Prisma com `connection_limit` explícito e warm-up;
- índices de performance (`20260916000000_add_performance_indexes`);
- rate limiters e graceful shutdown.

Os gargalos restantes para o cenário de **500 usuários em pico** eram outros.

---

## 2. Gargalos encontrados

| # | Gargalo | Risco sob 500 usuários | Severidade |
|---|---------|------------------------|------------|
| 1 | **bcrypt no thread HTTP** (`bcryptjs`, custo 12, ~200–400 ms por hash) | Cada login **bloqueia o event loop**: os demais requests (eventos, QR, SSE) congelam atrás da fila de logins. É o maior gargalo de pico. | 🔴 Crítico |
| 2 | **Rate limit por IP** (`600/15min` global e `20/15min` no login) | Uma atlética/campus inteiro compartilha **um único IP público** → os limites bloqueiam centenas de usuários legítimos em massa. Um login coletivo (500 numa sala) estoura o `AUTH_RATE_LIMIT_MAX=20`. | 🔴 Crítico |
| 3 | **Requisições pós-login fragmentadas** | Após o login o frontend fazia `/notifications` + `/conversations/unread-count` em chamadas separadas — uma onda extra de consultas exatamente no pico. | 🟡 Médio |
| 4 | **Cache sem limite de memória** | `Map` crescia indefinidamente em sessões longas → risco de pressão de heap. | 🟡 Médio |
| 5 | **Falha de pool = 500** | Timeout de pool (`P2024`) e perda de conexão (`P1001/P1002/P1017`) retornavam 500 genérico, sem `Retry-After`, dificultando backoff do cliente e diagnóstico. | 🟡 Médio |
| 6 | **Sem observabilidade** | Não havia como medir requests/s, p95/p99, 5xx, conexões SSE, saturação de pool/cache. "Passou no teste" sem dados não é prova. | 🟡 Médio |
| 7 | **Índices compostos ausentes** | Listagens administrativas por `status` + ordenação por data, presenças por `(activityId,status)`, certificados por `(eventId,status)`, inbox por `(status,lastMessageAt)` e pedidos/pagamentos por `(status,createdAt)` não tinham índice dedicado. | 🟠 Moderado |

---

## 3. Correções realizadas

### 3.1 bcrypt em worker threads (mantendo o custo 12)

Novos `utils/bcryptPool.js` + `utils/bcryptWorker.js`:

- hash/verify rodam em **worker threads**; o thread HTTP só aguarda a promise;
- **mesmo algoritmo e mesmo custo** (nunca reduzimos a segurança);
- fallback transparente para in-process se workers não puderem ser criados — login nunca falha por causa do pool;
- configurável por `BCRYPT_ROUNDS` (12) e `PASSWORD_HASH_WORKERS` (0 desliga; padrão CPU-1, máx. 4);
- `hashPassword`/`verifyPassword` substituem `bcrypt.hash/compare` em `authController` e `adminController`;
- encerramento limpo do pool no shutdown.

**Extra de segurança:** o login agora executa a comparação mesmo quando o e-mail não existe (tempo de resposta não revela se a conta existe).

### 3.2 Rate limiting NAT-safe (reescrito)

- **API geral:** bucket por **sessão** (hash SHA-256 do token/cookie, nunca o token em claro); anônimos caem no bucket por IP com teto mais alto (`RATE_LIMIT_ANON_MAX=3000/min`), porque todo o campus pode compartilhar um IP.
- **Login/registro (anti-brute-force):** bucket por **(IP + e-mail)** e `skipSuccessfulRequests: true` — **apenas tentativas falhas contam**. Uma turma inteira pode logar ao mesmo tempo.
- **`authPeakLimiter`:** teto grosso por IP (`600/min`) que absorve a onda de login legítima sem permitir flood.
- **`heavyLimiter`:** agora por **usuário** (exportações, inscrição, PIX, certificados).
- **`streamLimiter`:** por usuário/sessão (limita conexões SSE por cliente).

### 3.3 Endpoint agregado de sessão — `GET /api/bootstrap`

Retorna em **uma** resposta: usuário autenticado, prévia de notificações (8), `unreadNotifications` e `unreadConversations`. O `LiveDataContext` passou a usá-lo no início da sessão, com fallback para as chamadas individuais (que continuam existindo para os refreshes).

Efeito no pós-login:

```
V9.1: login → realtime/token → notifications → unread-count → stream   (4 HTTP + 1 SSE)
V9.2: login → bootstrap      → realtime/token → stream                  (3 HTTP + 1 SSE)
```

### 3.4 Cache com limite e métricas

- `CACHE_MAX_ENTRIES` (padrão 1000) com **evicção do mais antigo**; o heap não cresce sem limites;
- `cacheStats()` agora expõe `size`, `maxEntries`, `hits`, `misses`, `hitRate`, `inflight`.

### 3.5 Pool PostgreSQL e tratamento de erros

- `PRISMA_POOL_TIMEOUT` padrão caiu de 20s → **10s** (falhar rápido em saturação);
- novo `PRISMA_SOCKET_TIMEOUT=30` (recicla conexão travada);
- `P2024` (pool esgotado) e `P1001/P1002/P1017` (banco inacessível) → **HTTP 503 + `Retry-After: 2`** (em vez de 500), com log correlacionado.

### 3.6 Observabilidade e request-id

- middleware `observability`: gera/propaga `X-Request-Id`, mede latência e registra apenas requisições lentas ou 5xx (sem corpo, token ou dado pessoal);
- `GET /api/metrics` (JSON, sem dados de usuário) com requests/s, distribuição por status, **p50/p95/p99**, top rotas, conexões SSE, cache e pool de senha, e uso de memória. Protegido por `METRICS_TOKEN`; em produção sem token, retorna 404;
- contador de conexões SSE em `realtimeController`.

### 3.7 Índices compostos (migration aditiva)

Migration `20260917000000_add_scalability_indexes` (ver seção 5).

---

## 4. Arquivos alterados

**Backend — novos**

| Arquivo | Função |
|---|---|
| `src/utils/bcryptPool.js` | pool de worker threads para bcrypt (fallback in-process) |
| `src/utils/bcryptWorker.js` | entry point do worker |
| `src/utils/metrics.js` | contadores agregados, percentis, gauge de SSE |
| `src/middlewares/observability.js` | request-id + métricas de latência/erro |
| `src/controllers/bootstrapController.js` | bootstrap agregado da sessão |
| `scripts/load-test.mjs` | teste de carga progressivo (A–F) |
| `prisma/migrations/20260917000000_add_scalability_indexes/migration.sql` | índices aditivos |

**Backend — alterados**

| Arquivo | Alteração |
|---|---|
| `src/controllers/authController.js` | bcrypt via pool + comparação constante p/ e-mail inexistente |
| `src/controllers/adminController.js` | bcrypt via pool |
| `src/middlewares/rateLimiter.js` | reescrito: buckets por sessão/usuário/(IP+e-mail), peak limiter |
| `src/middlewares/errorHandler.js` | 503 + `Retry-After` para falhas de banco/pool, `requestId` |
| `src/routes/auth.routes.js` | `authPeakLimiter` + `authLimiter` |
| `src/routes/index.js` | rotas `/bootstrap` e `/metrics` |
| `src/config/env.js` | novas variáveis (bcrypt, limites, cache, métricas) |
| `src/config/prisma.js` | `socket_timeout`, `pool_timeout` 10s |
| `src/utils/cache.js` | limite de memória + estatísticas |
| `src/controllers/realtimeController.js` | gauge de conexões SSE |
| `src/server.js` | shutdown do pool de senha |
| `src/app.js` | middleware de observabilidade |
| `prisma/schema.prisma` | índices compostos (espelha a migration) |
| `.env.example` | documentação das novas variáveis |
| `package.json` | script `loadtest` |

**Frontend — alterado**

| Arquivo | Alteração |
|---|---|
| `src/api/services.js` | `bootstrapApi` |
| `src/context/LiveDataContext.jsx` | usa `/bootstrap` na inicialização, com fallback |

> Diffs completos em `CORRECOES_V9_2.diff`. **Nenhum** arquivo de CSS, componente visual, página ou assets foi tocado.

---

## 5. Migrations criadas

`backend/prisma/migrations/20260917000000_add_scalability_indexes/migration.sql`

- **Aditiva e idempotente** (`CREATE INDEX IF NOT EXISTS`);
- **sem DROP, TRUNCATE, DELETE ou alteração de coluna/tabela**;
- segura para `prisma migrate deploy` em banco populado.

Índices:

| Tabela | Índice | Consulta que atende |
|---|---|---|
| User | `(role, deletedAt)` | listagem admin por papel sem excluídos |
| Event | `(status, startDate)` | listagens "próximos/abertos" |
| Activity | `(eventId, status)` | grade do evento por status |
| Registration | `(userId, status)` / `(status, createdAt)` | minhas inscrições ativas / listagem admin |
| Attendance | `(activityId, status)` / `(eventId, status)` | roster e contagem de presentes |
| Certificate | `(eventId, status)` / `(status)` | listagem admin e dashboard |
| Conversation | `(status, lastMessageAt)` | inbox staff |
| Order | `(status, createdAt)` | listagem admin de pedidos |
| Payment | `(status, createdAt)` | listagem admin de pagamentos |

> Os índices de coluna única pré-existentes **não foram removidos** (regra de migration aditiva). Alguns ficam redundantes em relação aos compostos; a remoção é uma limpeza opcional futura e exige análise própria.

**Impacto:** apenas leitura mais rápida; pequeno custo adicional de escrita por INSERT/UPDATE. **Não apaga nem altera dados.**

---

## 6. Configurações recomendadas (produção)

```env
# Login / CPU
BCRYPT_ROUNDS=12
PASSWORD_HASH_WORKERS=2        # use 3-4 em instância com 4+ vCPUs

# Rate limit (NAT-safe)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=600             # por sessão autenticada
RATE_LIMIT_ANON_MAX=3000       # por IP (campus inteiro atrás de um NAT)
AUTH_RATE_LIMIT_MAX=10         # tentativas FALHAS por (IP+e-mail) / 15min
AUTH_PEAK_LIMIT_MAX=600        # teto grosso por IP / minuto
HEAVY_RATE_LIMIT_MAX=60
STREAM_RATE_LIMIT_MAX=20

# Pool PostgreSQL — NÃO colocar 500.
# conexões totais = instâncias × PRISMA_CONNECTION_LIMIT (+ margem)
PRISMA_CONNECTION_LIMIT=10     # 1 instância. Com 2 instâncias: 10-15 cada
PRISMA_POOL_TIMEOUT=10
PRISMA_CONNECT_TIMEOUT=10
PRISMA_SOCKET_TIMEOUT=30

# Cache
PUBLIC_CACHE_TTL_MS=15000
DASHBOARD_CACHE_TTL_MS=30000
AUTH_USER_CACHE_MS=5000
CACHE_MAX_ENTRIES=1000

# Observabilidade
METRICS_TOKEN=<um-token-forte>   # GET /api/metrics protegido
SLOW_REQUEST_LOG_MS=1000
```

---

## 7. Testes realizados

### 7.1 Testes executados nesta entrega (ambiente local, sem banco real)

| Teste | Resultado |
|---|---|
| `node --check` em todos os `.js`/`.mjs` do backend | ✅ 0 erros |
| `npx prisma generate` (valida o schema) | ✅ OK |
| Build do frontend (`npm run build`) | ✅ OK |
| Smoke: pool bcrypt (hash + verify, custo 12) | ✅ PASS (pool ativo) |
| Smoke: `GET /api/health` | ✅ 200 |
| Smoke: `GET /api/metrics` | ✅ 200 com p50/p95/p99 |
| Smoke: `POST /api/auth/login` inválido → 422 | ✅ |
| Smoke: `GET /api/bootstrap` sem token → 401 | ✅ |
| Smoke: header `X-Request-Id` presente | ✅ |
| Rate limit: 8 tentativas mesmo e-mail / 3 outro e-mail | ✅ 429 só no bucket do e-mail repetido |
| Falha de banco → 503 com log correlacionado | ✅ |

### 7.2 Teste de carga (a ser executado contra staging/produção)

Script entregue: `backend/scripts/load-test.mjs`. **Rode progressivamente** e **nunca comece com 500**.

```bash
cd backend
export LOAD_TEST_BASE_URL="https://acadeconnect-backend.onrender.com/api"
export LOAD_TEST_EMAIL_TEMPLATE="load{i}@seudominio.com"
export LOAD_TEST_PASSWORD="senha-dos-usuarios-de-teste"

node scripts/load-test.mjs --scenario login    --levels 25,50,100,250,500
node scripts/load-test.mjs --scenario events   --levels 100,250,500
node scripts/load-test.mjs --scenario navigate --levels 25,50,100,250
node scripts/load-test.mjs --scenario realtime --levels 50,100,250
node scripts/load-test.mjs --scenario messages --levels 50,100
```

Cenários implementados: **A** login, **B** navegação, **C** realtime/SSE, **D** eventos, **E** inscrições (opt-in, exige `--allow-write --event <id>` de um evento de teste), **F** mensagens.

Cada execução gera um JSON com requests, ok, 4xx, 5xx, RPS, p50/p95/p99 e máximo por nível de concorrência.

**Colete também durante o teste:** CPU/RAM do Render, conexões do PostgreSQL (`pg_stat_activity`), e `GET /api/metrics` antes/depois.

### 7.3 Critérios de aprovação

Não declare "suporta 500 usuários" sem medir. Registre concorrência, requests, sucessos, erros, p95, p99, CPU, RAM, DB e conexões, e identifique o primeiro gargalo.

---

## 8. Resultados

### 8.1 O que foi medido localmente

- bcrypt custo 12: ~1,0 s para hash+verify (round-trip) **fora do thread HTTP** — o event loop permaneceu responsivo (o smoke respondeu a `/health` imediatamente).
- Rate limiting: buckets isolados por e-mail (o teste comprovou que falhas de um e-mail não bloqueiam outro).
- Banco inacessível: todas as rotas degradaram para **503 com `Retry-After`**, não 500.

### 8.2 Efeito arquitetural esperado

| Fonte de carga | Antes (V9.1) | Depois (V9.2) |
|---|---|---|
| Login (hash) | bloqueia o event loop por ~300 ms | fora do thread HTTP (pool de workers) |
| Login de 500 pessoas no mesmo NAT | bloqueado no 20º por `AUTH_RATE_LIMIT_MAX` por IP | liberado (bucket por IP+e-mail, só falhas contam) |
| Navegação anônima do campus (1 IP) | bloqueada a 600 req/15min | 3000 req/min por IP (anônimo) |
| Pós-login | 4 HTTP + SSE | 3 HTTP + SSE |
| 500 de pool/conexão | 500 genérico | 503 + `Retry-After: 2` |
| Diagnóstico | nenhum | `/api/metrics` (p95/p99, 5xx, SSE, cache) |

> **Honestidade:** isto **prepara** o sistema para 500 simultâneos; não é uma certificação. A prova depende de rodar o teste de carga (7.2) no ambiente real. É possível que o gargalo final seja a instância do Render (vCPU) ou o plano do PostgreSQL —/ o que só o teste mostra.

---

## 9. Limitações e riscos conhecidos

1. **1 vCPU não ganha CPU com workers** — worker threads liberam o event loop, mas o custo total de CPU continua. Para absorver 500 logins em rajada é recomendável instância com **2+ vCPUs**.
2. **Escala horizontal do backend quebra o SSE** — o hub de eventos é em memória (`EventEmitter`). Com 2+ instâncias, um evento publicado na instância A não chega ao usuário conectado na B. É obrigatório Redis pub/sub (ou sticky + canal compartilhado) antes de escalar horizontalmente.
3. **Rate limit por token** — um cliente sem token compartilha o bucket do IP; o hash do token é apenas chave de partição (não é autenticação).
4. **`skipSuccessfulRequests` no login** — atacante com credenciais válidas não é limitado (comportamento intencional; credenciais válidas não são brute-force).
5. **`socket_timeout=30`** pode abortar consultas excepcionalmente longas (relatórios/migrations). Ajuste se necessário.
6. **Índices adicionais aumentam o custo de escrita** marginalmente; nada foi removido.
7. **Schema e migration devem permanecer sincronizados** — os índices foram adicionados nos dois.
8. **`/api/metrics` sem `METRICS_TOKEN`** fica exposto fora de produção; defina o token em produção.
9. O teste de carga com `--allow-write` grava dados — use evento de teste e limpe depois.

---

## 10. Recomendações de infraestrutura

### Render (backend)
- Instância com **2+ vCPUs** (ex.: Standard). `PASSWORD_HASH_WORKERS=2`.
- Manter **1 instância** enquanto o realtime for in-process.
- Health check em `/api/health` (não toca o banco).

### PostgreSQL
- Orçamento de conexões: `instâncias × PRISMA_CONNECTION_LIMIT ≤ max_connections − (margem p/ psql/migração)`.
  - 1 instância × 10 = 10 conexões (folga confortável).
  - 2 instâncias: 10–15 cada, plano com `max_connections` ≥ 60.
- Se usar **PgBouncer / pooled connection** do provedor em modo transação, adicione `?pgbouncer=true` e mantenha o pool do Prisma pequeno.
- **Nunca** `connection_limit=500`.
- Monitorar `pg_stat_activity` e locks durante o teste de carga.

### Aplicação
- Aplicar a migration com **`prisma migrate deploy`** (aditiva). **Nunca** `migrate reset`, `db push --force-reset`, `DROP`, `TRUNCATE` ou `DELETE` em massa.
- Ativar `METRICS_TOKEN` e coletar `/api/metrics` durante os testes.

### Escala futura (acima de 1 instância)
1. Adicionar Redis pub/sub em `services/realtime.js` (o contrato SSE do cliente já está pronto).
2. Migrar cache/rate limit para Redis se houver múltiplas instâncias.
3. Considerar CDN para `/uploads` (o Render já serve estáticos com cache imutável).

---

## 11. Instruções de deploy

```bash
# 1. Banco (aditivo, seguro)
cd backend
npx prisma migrate deploy        # aplica 20260917000000_add_scalability_indexes
# (Opcional) validar que os índices existem:
#   SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname;

# 2. Backend (Render)
#    - atualizar as variáveis de ambiente conforme a seção 6
#    - deploy do commit
#    - conferir logs de boot: "Banco de dados conectado"

# 3. Frontend (Vercel)
#    - deploy do commit (sem novas variáveis de ambiente)
```

Ordem recomendada: **migration → backend → frontend** (o frontend novo tolera o backend antigo por causa do fallback do `/bootstrap`).

---

## 12. Instruções de teste

```bash
# Sanidade rápida (sem carga)
curl -s https://SEU-BACKEND/api/health
curl -s -H "x-metrics-token: SEU_TOKEN" https://SEU-BACKEND/api/metrics | jq '.data.latencyMs, .data.requests'

# Carga progressiva (ver seção 7.2)
cd backend && npm run loadtest -- --scenario login --levels 25,50,100
```

Durante cada nível, acompanhe `/api/metrics` (p95/p99, 5xx, `sseConnections`) e o `pg_stat_activity`. Só suba a concorrência quando p95 e 5xx permanecerem estáveis.

---

## 13. Entrega

1. Código corrigido — pacote `MustangsAtletica_AcadeConnect_v9.2.zip`
2. Migration aditiva — `20260917000000_add_scalability_indexes`
3. `.env.example` atualizado
4. Script de carga — `backend/scripts/load-test.mjs`
5. Este relatório — `RELATORIO_ESCALABILIDADE_V9_2.md`
6. Lista de arquivos alterados — seção 4
7. Explicação objetiva de cada alteração — seção 3
8. Instruções de deploy — seção 11
9. Instruções de teste — seções 7.2 e 12
10. Riscos conhecidos — seção 9
```
LAYOUT PRESERVADO = SIM
```
