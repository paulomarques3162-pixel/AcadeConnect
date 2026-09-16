# RELATÓRIO FINAL DE AUDITORIA — AcadeConnect / Mustangs Atlética

**Versão de entrada:** `MustangsAtletica_AcadeConnect_v9.3.zip`
**Correção desta rodada:** V9.4 (payload da listagem + cache HTTP + limites de paginação)
**Backend de produção medido (somente leitura pública):** `https://acadeconnect-backend.onrender.com/api`
**Data:** 2026-09-16
**Regra seguida:** nenhum número foi inventado. O que não pôde ser medido está marcado **NÃO MEDIDO**.
**Deploy:** **NÃO EXECUTADO** — conforme §26, o trabalho para antes do deploy.

---

## 1. Gargalo encontrado

Continuação direta do relatório anterior (`RELATORIO_PERFORMANCE_FINAL.md`). O gargalo **não é o banco**:

| Endpoint | Payload | req/s (C≈50–60) | p50 |
|---|---:|---:|---:|
| `/health` (sem banco) | 109 B | 211–232 | 179–218 ms |
| `/events?limit=12` (cacheado em memória) | 8.343 B | 88–108 | 280–509 ms |

O banco já está resolvido (cache em memória + single-flight; requisições idênticas não consultam o PostgreSQL).
O custo por requisição é **JSON grande → serialização + gzip + ETag** — aproximadamente **2× mais caro** que um
endpoint trivial, sobre **uma única instância**. Faltavam duas coisas para aliviar isso sem trocar de instância:

1. **Payload da listagem maior do que o usado** (`GET /events` trazia a linha completa do evento).
2. **`Cache-Control` ainda não validado** — leituras repetidas sempre voltavam à origem.

---

## 2. Causa

| Id | Causa raiz |
|---|---|
| G1 | `listEvents` usava `include: eventInclude()` (linha inteira: `description`, `address`, flags, min/max de preço, `deletedAt`, timestamps, `institution`/`organizer` completos). A UI de listagem lê 12 campos. |
| G2 | `apiResponse()` não emitia `Cache-Control` (só `ETag`). `ETag` habilita `304`, mas **não evita a ida à origem**. |
| G3 | `limit` era `Number(req.query.limit)` sem teto em vários endpoints — um único cliente autenticado podia pedir `limit=999999`. |
| G4 | A variante de projeção pública/staff não existia; admin e público compartilhavam a mesma query e o mesmo cache. |

---

## 3. Correção

### 3.1 Projeção da listagem por perfil (P3 / §1 / §2)

Novo módulo `backend/src/utils/eventProjection.js` com dois `select` Prisma:

- **Público** (contrato mínimo lido por `EventCard`/`Events`/`Home`):
  `id, name, slug, shortDescription, bannerUrl, startDate, endDate, registrationEnd, status, location, category, _count.activities`.
- **Staff** (ADMIN/ORGANIZER) = público **+** `startTime` (grade da semana no AdminDashboard) **+**
  `_count.registrations` (coluna “Inscritos” em AdminEventos).

A projeção é escolhida **pelo token verificado** (`optionalAuthenticate`), nunca por parâmetro do cliente.
Compatibilidade verificada lendo o frontend antes de cortar qualquer campo (ver §2/§11). O **detalhe** (`GET /events/:slug`)
foi mantido intacto — ele usa 25 campos e não foi enxugado sem contrato.

### 3.2 Cache HTTP (§3 / §4 / §21)

- Lista e detalhe **públicos** respondem `Cache-Control: public, max-age=15, stale-while-revalidate=60`.
- **Somente anônimo**: respostas de staff usam `cacheSeconds: 0` (sem cache público).
- `Vary: Authorization, Cookie` em todas as respostas da listagem — um cache anônimo nunca é reproduzido para
  um usuário logado, e vice-versa.
- **Chave de cache** inclui variante + página + limite + categoria + modalidade + status + local + data + ordenação
  (filtros/ordenação nunca servem resposta de outra query).
- Busca continua **fora** do cache em memória (alta cardinalidade), mas com a projeção aplicada.

### 3.3 Paginação com teto (§7 / §9)

Novo `backend/src/utils/pagination.js` com `parsePagination()` e `paginationMeta()`. Teto aplicado a:
`/events` (público 60 / staff 200 via Joi `max(200)`), notificações (100), presenças (200), usuários (200),
auditoria (200), inscrições admin (500, por causa do modal “ver inscritos”), certificados admin (200),
pagamentos (200), pedidos (200). O schema Joi da listagem também valida `status`, `modality`, `date`, `sort`
e faz `stripUnknown` — parâmetros-operadores não chegam ao Prisma.

---

## 4. Arquivos alterados

### Backend — código
| Arquivo | Mudança |
|---|---|
| `backend/src/utils/eventProjection.js` | **novo** — selects público/staff |
| `backend/src/utils/pagination.js` | **novo** — teto de `page`/`limit` |
| `backend/src/controllers/eventController.js` | projeção por perfil, chave de cache por variante, `Vary`, clamp de paginação |
| `backend/src/routes/event.routes.js` | `optionalAuthenticate` + `validate(listQuery)` na listagem |
| `backend/src/validations/schemas.js` | **novo** `eventSchemas.listQuery` (validação + teto) |
| `backend/src/controllers/notificationController.js` | teto de paginação |
| `backend/src/controllers/attendanceController.js` | teto de paginação |
| `backend/src/controllers/adminController.js` | teto em usuários / auditoria / inscrições |
| `backend/src/controllers/certificateController.js` | teto na listagem admin |
| `backend/src/services/paymentService.js` | teto na listagem admin |
| `backend/src/services/orderService.js` | teto na listagem admin |

### Backend — testes/medição (novos)
| Arquivo | Papel |
|---|---|
| `backend/scripts/test-corrections-v94.mjs` | 17 testes: single-flight, chaves, contrato da projeção, payload, paginação, headers, ETag/304 |
| `backend/scripts/test-http-v94.mjs` | 8 testes HTTP reais no app (rotas V9.2, validação antes do banco) |
| `backend/scripts/test-qr-content.mjs` | 6 testes: decodifica o QR e valida token de presença **vs** PIX |
| `backend/scripts/measure-payload.mjs` | mede ANTES/DEPOIS do payload contra produção (read-only) |
| `backend/scripts/bench-json.mjs` | micro-benchmark local de `JSON.stringify + gzip` |
| `backend/scripts/validate-cache-live.mjs` | valida `ETag`/`304`/`Cache-Control` ao vivo |
| `backend/scripts/fixtures/events_list_limit12.prod.json` | captura real da produção usada nas medições |

### Frontend
**Nenhum arquivo alterado.** A correção é retrocompatível (o staff recebe o mesmo contrato de antes; o público
recebe um subconjunto que cobre tudo o que as telas leem). Identidade visual e layout preservados.

---

## 5. Payload antes/depois (§22)

Medição ao vivo (read-only) sobre os **mesmos eventos reais**, aplicando a projeção em processo
`node scripts/measure-payload.mjs`:

| Consulta | Eventos | ANTES (bytes) | DEPOIS (bytes) | Redução | gzip ANTES→DEPOIS | gzip % |
|---|---:|---:|---:|---:|---:|---:|
| `/events?limit=12` | 7 | 8.343 | 3.365 | **59,7%** | 1.320 → 792 | 40,0% |
| `/events?limit=9` | 7 | 8.342 | 3.364 | **59,7%** | 1.319 → 791 | 40,0% |
| `/events?limit=3` | 3 | 3.637 | 1.520 | **58,2%** | 939 → 554 | 41,0% |
| `/events?limit=9&sort=closest` | 7 | 8.342 | 3.364 | **59,7%** | 1.326 → 798 | 39,8% |
| `/events?limit=12&search=a` | 7 | 8.343 | 3.365 | **59,7%** | 1.320 → 792 | 40,0% |

Custo de `JSON.stringify + gzip` por requisição (benchmark local, 3.000 iterações — **não é medição de CPU do Render**):

| | ms/req | gzip médio |
|---|---:|---:|
| ANTES (linha completa) | 0,0842 – 0,0862 | 1.304 B |
| DEPOIS (projeção) | 0,0425 – 0,0426 | 786 B |
| **Redução** | **≈ 49–51%** | — |

---

## 6. Performance antes/depois (§20)

### ANTES (medido em produção, versão V9.3 — do relatório anterior)
| Concorrência | Requests | OK | 4xx | 5xx | net | p50 | p95 | p99 | Máx | RPS |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 24 | 24 | 0 | 0 | 0 | 116,7 ms | 214,6 ms | 287,4 ms | 287,4 ms | 40,3 |
| 25 | 59 | 59 | 0 | 0 | 0 | 101,9 ms | 298,6 ms | 367,9 ms | 367,9 ms | 118,5 |
| 50 | 117 | 117 | 0 | 0 | 0 | 309,8 ms | 881,1 ms | 901,1 ms | 911,1 ms | 82,8 |

Isolamento: `/health` ≈ 211–232 req/s; `/events?limit=12` ≈ 88–108 req/s.

### DEPOIS (V9.4)
- **Produção: NÃO MEDIDO** — a correção **não foi implantada** (regra: parar antes do deploy).
- Confirmado ao vivo que a produção **ainda** hoje não envia `Cache-Control` (pré-requisito da correção).
- Evidência local do ganho esperado: payload **−59,7%** e trabalho de serialize+gzip **−~50%/req**.
- Com `Cache-Control`, leituras repetidas passam a ser servidas por browser/CDN, removendo-as da origem.

> **Níveis 100/200/250/350/500:** **NÃO EXECUTADOS em produção** (proibido pela regra). O comando para o
> ambiente de teste está em §15.

---

## 7. Cache antes/depois (§3 / §21)

Validação ao vivo (`node scripts/validate-cache-live.mjs`):

| Item | ANTES (produção, hoje) | DEPOIS (código V9.4) |
|---|---|---|
| `Cache-Control` lista pública | **ausente** | `public, max-age=15, stale-while-revalidate=60` |
| `Cache-Control` detalhe público | **ausente** | `public, max-age=15, stale-while-revalidate=60` |
| `Cache-Control` respostas de staff | ausente | ausente (por design, `cacheSeconds: 0`) |
| `ETag` fraco | presente | presente (inalterado) |
| `If-None-Match` → `304` | **funciona** (corpo 0 B) | funciona; `304` preserva `Cache-Control` |
| `Vary` | `Origin, Accept-Encoding` | `+ Authorization, Cookie` |
| Chave distinta por filtro | `ETag` muda por `limit`/`status`/`sort` | idem + variante público/staff |
| `cf-cache-status` | `DYNAMIC` | depende da regra de CDN (ver §15) |

**Teste automatizado:** `test-corrections-v94.mjs` comprova (a) o header no `200`, (b) **nenhum** header público
com `cacheSeconds: 0`, (c) `304` por `If-None-Match` mantendo o `Cache-Control`, (d) `Vary` com `Authorization`.

Nunca há `Cache-Control: public` em: inscrições do usuário, notificações, mensagens, pagamentos individuais,
perfil, certificados privados ou pedidos. O único caminho que passa `cacheSeconds > 0` é a lista/detalhe de
eventos públicos — e agora **somente quando não há usuário autenticado**.

---

## 8. Testes funcionais (executados)

| Suíte | Comando | Resultado |
|---|---|---|
| Sintaxe — todos os `.js` do backend | `node --check` | **OK (0 falhas)** |
| Primitivos de performance | `node scripts/test-performance.mjs` | **11 PASS / 0 FAIL** |
| PIX / EMV / CRC16 | `node scripts/test-pix.mjs` | **17 PASS / 0 FAIL** |
| Timezone / fim de atividade | `node scripts/test-timezone.mjs` | **9 PASS / 0 FAIL** |
| Correções V9.4 (cache/single-flight/projeção/paginação/payload) | `node scripts/test-corrections-v94.mjs` | **17 PASS / 0 FAIL** |
| QR — conteúdo decodificado (presença **vs** PIX) | `node scripts/test-qr-content.mjs` | **6 PASS / 0 FAIL** |
| Smoke HTTP no app real (rotas V9.2 + validação antes do banco) | `node scripts/test-http-v94.mjs` | **8 PASS / 0 FAIL** |
| Build do frontend | `npm run build` | **PASS** |

**Total: 68 testes automatizados PASS / 0 FAIL** (sem banco de dados).

### Destaques
- **QR de presença:** o PNG gerado pelo backend é decodificado (`jsqr`) e o conteúdo é **exatamente o token opaco**,
  sem prefixo/mutação; **não contém** o marcador PIX.
- **QR PIX:** o conteúdo decodificado é **igual ao payload “copia e cola”**, com `br.gov.bcb.pix`, valor `50.00`
  e CRC válido. Presença e PIX **não se confundem**.
- **Rotas V9.2** (`broadcast`, `cancel-present`) respondem `401` sem token (não `404`) — estão registradas.
- **Validação antes do banco:** `limit=999999`, `limit=abc`, `status=HACKED` → `422` sem tocar o PostgreSQL.

### Testes que dependem de banco — **NÃO EXECUTADOS** (honestamente)
Sem PostgreSQL/ambiente de teste neste sandbox, **não** foram executados ponta a ponta: login, cadastro,
inscrição sob concorrência, vagas, estoque, cupom, sorteio, evento pago/PIX ponta a ponta, cancelamento em
massa de certificados, broadcast em banco real, loja e leitura ao vivo do QR contra um evento real.
Esses fluxos têm script e ficam para o ambiente de teste (§15). **Não foram declarados “funcionais” sem teste.**

---

## 9. Testes de concorrência (§5 / §19)

### Executado (sem banco)
- **Single-flight:** 100 chamadas concorrentes idênticas ao cache (`/events` sem busca) → **1 única** execução do
  produtor (1 consulta ao “banco”) e **1 objeto compartilhado** entre os 100 chamadores.
- **Isolamento de chave:** público, staff, `limit=12` e `limit=3` produzem entradas distintas.
- **Invalidação:** `invalidate('events:')` remove lista (público + staff) e detalhe de uma vez.

### NÃO EXECUTADO (depende de banco de teste)
100 usuários/10 vagas; 100/5 no estoque; 100 requisições no mesmo QR; 100 inscrições simultâneas do mesmo
usuário; 2 admins no sorteio; 100 usuários no último cupom. O código já usa as proteções conhecidas
(`updateMany` condicional de estoque, `usedCount < maxUses`, transação + índice único, `crypto.randomInt`),
mas **consistência sob corrida não foi medida**. Passo pendente do §15.

---

## 10. Segurança (§10 / §25)

- **Nunca** `Cache-Control: public` em resposta autenticada: o header só é emitido quando `!req.user`; teste
  dedicado cobre o caso privado.
- `Vary: Authorization, Cookie` impede que um cache anônimo seja servido a uma sessão logada (e vice-versa).
- Projeção escolhida **pelo token**, não por input do cliente — não há como um anônimo pedir a variante staff.
- Validação Joi com `stripUnknown` + whitelist de `status`/`modality`/`sort`: parâmetros-operadores
  (ex.: `evil[$ne]`) não chegam ao Prisma.
- Teto de paginação remove o vetor de exaustão de CPU/memória via `limit=999999`.
- Nenhum segredo exposto, nenhuma autenticação afrouxada, RBAC/ownership preservados. Nenhuma alteração de banco.

---

## 11. Frontend (§2 / §16 / §24)

- **Contrato preservado.** Verificação campo a campo:
  - `EventCard`/`Events`/`Home` usam exatamente os 12 campos da projeção pública.
  - `AdminEventos` e `AdminDashboard` usam `_count.registrations` e `startTime` (presentes na projeção staff).
  - `EventDetail` usa 25 campos → **detalhe não foi enxugado**.
- **Nenhuma alteração de layout** (regra absoluta). Identidade visual, cores, logo, estrutura e tema intactos.
- Recursos das rodadas anteriores permanecem: botão **Compartilhar evento** (Web Share + WhatsApp/Facebook/X/copiar),
  painel de **Comunicação geral** e **cancelamento em massa de certificados dos presentes**.
- **Build de produção do frontend: PASS** (Vite), incluindo as telas de eventos e admin.
- Melhorias visuais incrementais (§24) **não** foram aplicadas nesta rodada para não violar “não alterar o layout
  radicalmente” sem verificação visual; ficam como item de baixo risco para uma rodada com revisão de UI.

---

## 12. Banco (§8 / §12)

- **Nenhuma mudança de schema, nenhum dado alterado, nenhum reset.**
- Índices existentes (migrations `add_performance_indexes`, `add_scalability_indexes`) revisados: todos mapeiam
  para queries reais; **nenhum índice novo foi criado** (a regra pede não criar índice sem necessidade e o banco
  não é o gargalo).
- A listagem com `orderBy createdAt desc` é servida por `Event(deletedAt, createdAt)`; `sort=closest` por
  `Event(startDate)`. Recomendação: rodar `pg_stat_user_indexes` / `pg_stat_statements` no banco para confirmar
  uso real e eventual remoção de índices redundantes — **NÃO MEDIDO** (sem acesso ao banco).

---

## 13. Migrations

**Nenhuma migration criada.** A correção é só de código (projeção, cache, validação). Nenhum comando destrutivo
(`DROP`/`TRUNCATE`/`DELETE`/reset) foi executado.

---

## 14. Riscos restantes

1. **Capacidade (G1):** a correção reduz carga, mas o teto físico de uma instância Render permanece para
   requisições que ainda chegam à origem.
2. **Deploy pendente:** nenhum ganho de latência é real até o backend ser publicado e o CDN configurado.
3. **CDN:** `Cache-Control` só ajuda se o Cloudflare respeitar/armazenar a resposta (hoje `DYNAMIC`). Requer regra
   de cache para `GET /api/events*` respeitando `Vary`.
4. **SSE em instância única:** pub/sub é in-process; múltiplas instâncias exigem broker (ex.: Redis).
5. **`METRICS_TOKEN`:** sem ele, `/api/metrics` fica 404 em produção e não há diagnóstico de CPU/cache hit.
6. **Token de staff expirado:** como a rota é `optionalAuthenticate`, um ADMIN com token inválido recebe a
   projeção pública (sem `_count.registrations`/`startTime`) até ser redirecionado ao login pelos outros
   endpoints. Impacto: contagem “Inscritos” = 0 por instantes. Baixo, mas registrado.
7. **Índices redundantes:** candidatos a limpeza após confirmação via `pg_stat_user_indexes` (**NÃO MEDIDO**).
8. **Testes de integração/concorrência** ainda não executados (sem banco de teste).

---

## 15. Passos de deploy (não executados)

> **Nada foi implantado.** Sequência proposta para o ambiente de **teste** primeiro:

1. **Revisar o diff** `CORRECOES_V9_4.diff` (16 arquivos).
2. **Teste, não produção:** subir PostgreSQL semeado representativo; `npm ci`.
   Sem nova migration, `prisma migrate deploy` apenas confirma o estado.
3. Configurar `METRICS_TOKEN` e `PUBLIC_CACHE_TTL_MS` (padrão 15000) no ambiente de teste.
4. **Validar cache/headers** no teste:
   `curl -sI "$TESTE/api/events?limit=12"` (espera `Cache-Control` + `ETag`);
   repetir com `If-None-Match` (espera `304`); confirmar `Vary` com `Authorization`.
5. **Medir payload** no teste: `node scripts/measure-payload.mjs "$TESTE/api"` (esperado ≈ −58% a −60%).
6. **Carga progressiva no teste (sem tocar produção):**
   ```
   node scripts/load-test.mjs --base "$TESTE/api" --scenario events   --levels 10,25,50,100,200,250,350,500
   node scripts/load-test.mjs --base "$TESTE/api" --scenario navigate --levels 10,25,50,100,250 --template load{i}@teste.local --password '<senha-teste>'
   node scripts/load-test.mjs --base "$TESTE/api" --scenario realtime --levels 50,100 --template load{i}@teste.local --password '<senha-teste>'
   ```
   Registrar p50/p95/p99/RPS/4xx/5xx e comparar **com e sem** `Cache-Control`.
7. **Suítes funcionais de integração** no teste: QR (câmera/manual, evento certo/errado, duplicidade), PIX
   ponta a ponta (1 e >1 administradores, valor pelo backend, CRC, confirmação de estado), loja/estoque,
   notificações/SSE, sorteio concorrente, vagas/cupom, cancelamento em massa, broadcast.
8. **Produção (somente após aprovação):** publicar backend; conferir `Cache-Control`/`304`;
   criar regra de cache do Cloudflare para `GET /api/events*` (respeitando `Vary: Authorization, Cookie`);
   observar `cf-cache-status: HIT` nas leituras anônimas.
9. **Medir** `/api/metrics` antes/depois e repetir a carga leve. **Não executar 500 em produção.**

---

## Anexo A — Resumo dos números

| Métrica | Valor |
|---|---|
| Payload `/events?limit=12` | 8.343 B → **3.365 B** (−59,7%) |
| gzip `/events?limit=12` | 1.320 B → **792 B** (−40,0%) |
| CPU local serialize+gzip/req | −**49–51%** |
| Testes automatizados (sem banco) | **68 PASS / 0 FAIL** |
| Testes de integração (banco) | **NÃO EXECUTADOS** |
| Load test V9.4 em produção | **NÃO MEDIDO** (deploy pendente) |
| Migrations | **nenhuma** |
| Deploy | **não executado** |

## Anexo B — Arquivos-referência gerados

- `CORRECOES_V9_4.diff` — diff completo contra o V9.3.
- `MustangsAtletica_AcadeConnect_v9.4.zip` — projeto corrigido (sem `node_modules`/`dist`).
- Scripts de teste/medição em `backend/scripts/` (ver §4).
