# Performance — Antes / Depois (V8 → V9)

> **Transparência:** o ambiente de análise **não tinha PostgreSQL**, portanto **latência (p50/p95/p99), throughput (req/s) e erros HTTP não foram medidos** com carga real. Onde o número não foi medido, está escrito **“não medido”**.
> Os números marcados como **medido** vêm de execução real nesta máquina (build de produção, testes unitários, smoke test). Os números marcados como **código** são derivados da leitura do fluxo (contagem de requests/consultas), não de teste de carga.

---

## 1. Tabela principal (formato solicitado)

| Métrica | Antes | Depois |
|---|---:|---:|
| p50 | não medido | não medido |
| p95 | não medido | não medido |
| p99 | não medido | não medido |
| Requests/s | não medido | não medido |
| Erros | não medido | não medido |
| Queries/request (dashboard) | ~10–12 por chamada | 0 no cache hit; ~10–12 no miss |
| Queries/request (relatório) | 6 + carga ilimitada | 7 (sem carga ilimitada) |
| Conexões DB | não medido (pool implícito) | pool explícito, padrão 10 |

---

## 2. Volume de requisições (derivado do código — cenário 200 abas)

Cenário: 200 participantes com uma conversa aberta.

| Fluxo | Antes (V8) | Depois (V9) | Redução estimada |
|---|---:|---:|---:|
| Refresh de mensagens | 12 req/min por aba → **~2.400 req/min** | SSE: **0** polls; fallback adaptativo ≥1/min por aba em ociosidade | **~92%+** (e cada request traz só o que mudou) |
| Tamanho de cada refresh | thread inteira (cresce com o tempo) | apenas mensagens novas (de-dup por id) | proporcional ao histórico |
| Intervalo ocioso | fixo 5s | 5s → até 60s (backoff) | — |
| Aba em background | continuava | **pausado** | 100% em aba oculta |
| Badge de não lidas | 1 req/min por usuário | SSE + 0,5 req/min (visível) / 0 (oculta) | ~50–100% |
| Notificações (bell) | 1 carga no mount | SSE (push) + refresh no foco | — |

---

## 3. Trabalho no banco (derivado do código)

| Operação | Antes (V8) | Depois (V9) |
|---|---|---|
| Notificar N inscritos de um evento | 1 SELECT + **N INSERTs** | 1 SELECT + **1 `createMany`** |
| Notificar todos os admins (nova mensagem) | 1 SELECT + **N INSERTs** | 1 SELECT + **1 `createMany`** |
| Relatório (`/admin/reports`) | `findMany` de **todas** as inscrições + presenças para somar em JS | `count` + `groupBy` no banco (nenhuma linha transportada) |
| Resumo de presença por evento | carregava **todas** as presenças de todas as atividades | `groupBy` + projeção de 2 colunas |
| Emissão massiva de certificados | 1 consulta pesada por participante (include de 5 relações) | 1 consulta por lote de 50 + email reaproveitado |
| Listas (`* me`, produtos, sorteios, conversas…) | sem limite | `take` explícito |
| Thread de conversa (carga inicial) | todos os históricos | últimas 200 mensagens |
| Consulta do usuário autenticado | 1 por request protegido | cache 5s (invalidado em escrita) |
| Rajada de requisições idênticas (público) | 1 consulta por requisição | **1 consulta total** (single-flight) |

---

## 4. Métricas medidas

### 4.1 Bundle de produção (medido — `vite build`)

| Item | V8 | V9 | Δ |
|---|---:|---:|---:|
| Entry JS (soma `index-*`) | 272.467 B | 273.821 B | +1.354 B (+0,50%) |
| Total JS (raw) | 1.244.733 B | 1.247.497 B | +2.764 B (+0,22%) |
| Total JS (gzip) | 395.366 B | 396.493 B | +1.127 B (+0,29%) |
| CSS total | 28.373 B | 28.373 B | **0** |

**Leitura honesta:** o bundle ficou praticamente igual (+0,22%). Parte disso é o novo cliente SSE (~2,4 kB) e o hook reescrito. Não houve regressão de layout (CSS idêntico ao byte).
> Foi avaliado juntar `recharts`/`html5-qrcode` em chunks manuais; **a mudança foi revertida** porque o lazy-loading existente já separava essas libs e o agrupamento forçado **aumentava** o chunk de gráficos (411 kB contra 374 kB tree-shaken do V8). Decisão: não introduzir regressão por otimização cosmética.

### 4.2 Testes (medido)

| Suíte | Comando | Resultado |
|---|---|---|
| Unit (cache/single-flight, pub-sub, tokens) | `node backend/scripts/test-performance.mjs` | **11 PASS / 0 FAIL** |
| Smoke (boot da app, rotas, guards de auth, health) | script de boot | **9 PASS / 0 FAIL** |
| Sintaxe do backend | `node --check` (todos os arquivos) | **PASS** |
| Build do frontend | `npm run build` | **PASS** |
| Schema + migração | `prisma validate` + `migrate diff` | **PASS** (29/29 nomes de índice conferem) |

### 4.3 Não medido (honestamente)

- p50 / p95 / p99 de latência
- Requests/s e taxa de erro sob carga (10/25/50/100/200/500 usuários)
- Conexões ativas no PostgreSQL e uso de CPU/memória do Render

**Motivo:** não há PostgreSQL no ambiente desta análise. Para medir de verdade, rodar o plano da §5 em um ambiente de teste (nunca em produção).

---

## 5. Plano de teste de carga (para executar em ambiente de teste)

1. Subir PostgreSQL + backend em ambiente de teste (não produção) e semear dados representativos.
2. Rodar cenários de **10, 25, 50, 100, 200 e 500** usuários simultâneos (ex.: `autocannon`/`k6`), com rampa, sobre:
   - `GET /api/events` e `GET /api/events/:slug`
   - `GET /api/products`
   - `GET /api/registrations/me`
   - `GET /api/conversations/:id/messages?since=...` (incremental)
   - `GET /api/admin/dashboard`
3. Medir p50/p95/p99, req/s, HTTP 429/5xx, conexões no Postgres, CPU/memória.
4. Comparar **V8 vs V9** com a mesma base de dados e mesma máquina.
5. Registrar aqui os números reais (substituindo os “não medido”).

A configuração `PRISMA_LOG_QUERIES=true` + `PRISMA_SLOW_QUERY_MS=100` mostra as consultas lentas durante o teste, para orientar os próximos índices.
