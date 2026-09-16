# RELATÓRIO DE PERFORMANCE FINAL — AcadeConnect / Mustangs Atlética

**Backend medido:** `https://acadeconnect-backend.onrender.com/api` (produção, somente leitura pública)
**Data:** 2026-09-16
**Método:** `backend/scripts/load-test.mjs` (cenário `events`) + bursts controlados de `fetch` concorrente
**Regra:** números reais. O que não foi medido está marcado **NÃO MEDIDO**.

> **Importante:** as medições abaixo são da versão **antes** das correções desta auditoria
> (as correções ainda **não foram implantadas**). O efeito do `Cache-Control` só poderá ser
> medido após deploy.

---

## 1. Tabela principal — cenário `events` (progressivo)

| Concorrência | Requests | OK | 4xx | 5xx | net err | p50 | p95 | p99 | Máx | RPS |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 24 | 24 | 0 | 0 | 0 | 116,7 ms | 214,6 ms | 287,4 ms | 287,4 ms | 40,3 |
| 25 | 59 | 59 | 0 | 0 | 0 | 101,9 ms | 298,6 ms | 367,9 ms | 367,9 ms | 118,5 |
| 50 | 117 | 117 | 0 | 0 | 0 | 309,8 ms | 881,1 ms | 901,1 ms | 911,1 ms | 82,8 |

Leitura: **zero 5xx, zero erro de rede**; a latência cresce com a concorrência e o throughput
estabiliza em ~80–120 req/s. É fila por CPU, não indisponibilidade.

---

## 2. Isolamento do gargalo (burts controlados, C = 50–60)

Duas rodadas por endpoint, com aquecimento de cache:

| Endpoint | Tamanho | req/s | p50 | p95 | p99 |
|---|---:|---:|---:|---:|---:|
| `/health` (sem banco) | 109 B | 232,4 | 179 ms | 324 ms | 432 ms |
| `/telemetry` `/events?limit=12` (cacheado) | 8.343 B | 92,0 | 679 ms | 1.062 ms | 1.102 ms |
| `/health` (2ª rodada) | 109 B | 209,0 | 218 ms | 474 ms | 516 ms |
| `/events?limit=12` (2ª rodada) | 8.343 B | 100,6 | 509 ms | 927 ms | 1.001 ms |

**Conclusão:** o banco **não** é o gargalo (a lista pública é servida do cache em memória com
single-flight; requisições idênticas não consultam o PostgreSQL). O custo é o processamento
por requisição do JSON grande (serialização + gzip + ETag) sobre **uma única instância**.
`/health` chega a ~210–232 req/s; `/events` a ~90–108 req/s — ~2× mais caro.

### 2.1 Compressão (gzip) — influência isolada

| Accept-Encoding | req/s | p50 |
|---|---:|---:|
| `gzip` | 88,5 → 108,8 | 315 → 280 ms |
| `identity` | 107,2 → 113,1 | 299 → 277 ms |

Diferença dentro do ruído: a compressão **não** é o gargalo predominante; o teto é a instância.

---

## 3. Payload observado

| Consulta | Eventos | Tamanho | Campos |
|---|---:|---:|---|
| `GET /events?limit=12` | 7 | 8.343 B | linha completa do evento (~1,25 KB cada): inclui `description`, `address`, flags, min/max de preço, `deletedAt`, timestamps, `institution`/`organizer` e `_count` |
| `GET /events?limit=3` | 3 | 3.637 B | idem |
| `GET /events/:slug` | 1 | 1.800 B | detalhe (inclui atividades) |

A UI de listagem usa apenas: `id`, `name`, `slug`, `shortDescription`, `bannerUrl`,
`startDate`, `endDate`, `registrationEnd`, `status`, `location`, `category`,
`_count.activities`. O restante é transportado sem uso (P3 da auditoria).

---

## 4. Comportamento de cache/borda observado

- `ETag` fraco presente → `If-None-Match` responde **304** corretamente (revalidação barata).
- **`Cache-Control` ausente** na versão medida → browser/CDN sempre vão à origem.
- Backend atrás de Cloudflare (`server: cloudflare`, `cf-cache-status: DYNAMIC`).
- Rate limit anônimo: `ratelimit-limit: 3000; w=60` por IP. Sob rajada forte, `429` é possível.

---

## 5. Correção aplicada (código) e o que esperar

`GET /api/events` (lista e detalhe) agora respondem:

```
Cache-Control: public, max-age=15, stale-while-revalidate=60
```

Efeito esperado após deploy: leituras repetidas das páginas públicas passam a ser
respondidas por browser/CDN, removendo a maior parte das requisições repetidas da origem.
**Esse efeito NÃO foi medido** (deploy pendente). Endpoints autenticados permanecem sem
cache público.

---

## 6. O que NÃO foi medido (honestamente)

| Métrica | Status |
|---|---|
| p50/p95/p99 **depois** das correções | **NÃO MEDIDO** (não implantado) |
| CPU / RAM do Render | **NÃO MEDIDO** (sem acesso ao painel) |
| Conexões PostgreSQL / pool Prisma sob carga | **NÃO MEDIDO** (sem acesso ao banco) |
| Event loop lag | **NÃO MEDIDO** |
| Nº de conexões SSE ativas | **NÃO MEDIDO** em produção |
| Cenários autenticados (login/bootstrap/inscrição/pagamento) | **NÃO EXECUTADOS** (faltam contas de teste) |
| Níveis 100/200/250/350/500 | **NÃO EXECUTADOS** (evitar carga alta em produção) |

Para medir CPU/RAM/conexões: setar `METRICS_TOKEN` e ler `GET /api/metrics`
(hoje retorna 404 sem token em produção).

---

## 7. Plano para medir 100→500 com segurança

1. Ambiente de teste (não produção) com PostgreSQL semeado representativo.
2. Criar contas `loadNNN@teste.local` **somente no banco de teste**.
3. `METRICS_TOKEN` configurado; `PRISMA_LOG_QUERIES=true` + `PRISMA_SLOW_QUERY_MS=100`.
4. Rodar o próprio script, progressivo, parando em comportamento anormal:
   ```
   node scripts/load-test.mjs --base <TESTE>/api --scenario events     --levels 10,25,50,100,200,250,350,500
   node scripts/load-test.mjs --base <TESTE>/api --scenario navigate   --levels 10,25,50,100,250 --template load{i}@teste.local --password '...'
   node scripts/load-test.mjs --base <TESTE>/api --scenario realtime   --levels 50,100 --template load{i}@teste.local --password '...'
   ```
5. Comparar origem com e sem `Cache-Control` e registrar no §1 desta página.
