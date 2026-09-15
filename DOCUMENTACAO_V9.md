# AcadeConnect / Mustangs Atlética — V9 (Performance e Concorrência)

Esta versão corrige os gargalos de performance sob alto número de acessos **sem alterar o layout nem as funcionalidades**. O que mudou, como aplicar e como operar está abaixo.

---

## 1. Como aplicar

```bash
# backend — aplica SOMENTE a migration nova (aditiva, sem reset, sem perda de dados)
cd backend
npm install                 # instala a dependência nova (compression)
npx prisma migrate deploy   # aplica 20260916000000_add_performance_indexes
npx prisma generate

# frontend
cd ../frontend
npm install
npm run build
```

> A migration `20260916000000_add_performance_indexes` contém **apenas `CREATE INDEX IF NOT EXISTS`**. Não há `DROP`, `TRUNCATE`, `DELETE` nem alteração de tabela/coluna. Pode ser aplicada em banco populado com segurança.

**Nunca** execute em produção: `prisma migrate reset`, `prisma db push --force-reset`, `DROP`, `TRUNCATE`.

---

## 2. Variáveis de ambiente novas (todas com default — opcionais)

| Variável | Default | Para que serve |
|---|---|---|
| `PRISMA_CONNECTION_LIMIT` | `10` | Máx. de conexões simultâneas **deste processo**. **Não eleve sem medir.** |
| `PRISMA_POOL_TIMEOUT` | `20` | Segundos de espera por conexão livre |
| `PRISMA_CONNECT_TIMEOUT` | `10` | Segundos de espera do handshake |
| `PRISMA_LOG_QUERIES` | `false` | Loga consultas lentas (diagnóstico; não usar verboso em prod) |
| `PRISMA_SLOW_QUERY_MS` | `100` | Limiar para logar consulta lenta |
| `PUBLIC_CACHE_TTL_MS` | `15000` | TTL do cache de dados públicos (eventos, loja, sorteios) |
| `DASHBOARD_CACHE_TTL_MS` | `30000` | TTL do cache do dashboard do ADM |
| `AUTH_USER_CACHE_MS` | `5000` | TTL do cache do usuário autenticado |
| `COMPRESSION_ENABLED` | `true` | gzip para JSON/texto |
| `COMPRESSION_THRESHOLD` | `1024` | Tamanho mínimo para comprimir |
| `HEAVY_RATE_LIMIT_MAX` | `30` | Limite/min para endpoints pesados (export, certificado, pedido, PIX, inscrição) |
| `STREAM_RATE_LIMIT_MAX` | `30` | Limite/min para abrir streams SSE |
| `RATE_LIMIT_MAX` | `600` | Limite global da API por IP (era 300) |
| `KEEP_ALIVE_TIMEOUT_MS` | `65000` | Keep-alive HTTP (proxy do Render) |
| `HEADERS_TIMEOUT_MS` | `66000` | Timeout de headers |

O arquivo `backend/.env.example` já documenta todas.

---

## 3. Tempo real (SSE)

- `POST /api/realtime/token` (autenticado) → `{ token }` de **curta duração (2 min), escopo `stream`**.
- `GET /api/realtime/stream?token=...` → stream `text/event-stream`.
- Eventos: `connected`, `notification`, `message`, `conversation`.
- O frontend usa **1 conexão por aba** (cliente singleton em `frontend/src/api/realtime.js`).
- Fallback: se o SSE cair, o frontend reconecta com backoff e mantém o polling **incremental e adaptativo**, então a tela nunca fica incorreta.

**Limitação importante:** o hub é **em processo**. Em uma instância (Render) atende todos. Se escalar horizontalmente, será preciso um broker compartilhado (ex.: Redis pub/sub); até lá o fallback cobre.

---

## 4. Cache (em memória)

`backend/src/utils/cache.js` — TTL + **single-flight** (rajada idêntica = 1 consulta) + invalidação por prefixo.

Usado em: eventos (lista/detalhe públicos), loja (produtos ativos), resultados públicos de sorteio, dashboard do ADM, usuário autenticado.

Regras:
- **Só** para dados que podem ficar alguns segundos desatualizados.
- **Nunca** para dado privado por usuário (autorização continua exata).
- Toda escrita relacionada invalida o prefixo correspondente.

---

## 5. Comportamento preservado (não mexer sem necessidade)

Fluxos de **PIX** (EMV/CRC, chave, validade, regeneração), **QR de presença** (câmera/manual, dia da atividade, duplicidade), **inscrições**, **certificados** (emissão/correção/cancelamento/massa), **pedidos/estoque**, **sorteio** e **mensagens** mantêm a lógica funcional. As mudanças foram de eficiência (lotes, limites, transações), não de regra de negócio.

---

## 6. Diagnóstico em produção

- Consultas lentas:
  ```env
  PRISMA_LOG_QUERIES=true
  PRISMA_SLOW_QUERY_MS=100
  ```
  (desligar depois)
- Health check: `GET /api/health` (não toca o banco, não consome rate limit).
- Se o SSE não conectar atrás de algum proxy, o polling de fallback assume — verifique o console do navegador.

---

## 7. Testes incluídos

```bash
cd backend
node scripts/test-performance.mjs   # 11 PASS / 0 FAIL (cache, pub-sub, tokens)
```

Os testes de integração de ponta a ponta (PIX, QR, pedidos, inscrições, certificados, mensagens) exigem PostgreSQL e devem ser rodados no ambiente de teste com os scripts já existentes do projeto.
