# RELATÓRIO FINAL — V9.5 (Login/Rate Limiter + Redesign do Sorteio)

**Base:** `MustangsAtletica_AcadeConnect_v9.4` (V9.4 preservada)
**Escopo:** corrigir o bloqueio indevido de login (HTTP 429) e redesenhar visualmente apenas a área de Sorteio.
**Deploy:** **NÃO EXECUTADO.** Nenhuma conta foi criada em produção. Nenhuma migration.

---

## LOGIN

### Causa encontrada (com evidência)
O `authLimiter` do `express-rate-limit` **conta a requisição na ENTRADA da rota**. Quando o orçamento de `(IP + e-mail)` chega a `max` (10), o middleware responde **429 antes de o handler rodar** — então até uma senha **correta** passa a ser recusada até a janela de 15 min expirar. Isso bate exatamente com os headers de produção:

```
ratelimit-limit: 10 · ratelimit-remaining: 0 · ratelimit-policy: 10;w=900 · retry-after: 444
```

`skipSuccessfulRequests: true` **funciona** para sucessos que chegam a executar (provado por teste), mas **não salva** a requisição seguinte quando o contador já está cheio, porque ela é barrada antes do handler. Foi reproduzido localmente:

| Cenário | `authLimiter` (V9.4) | `loginAttempts` (V9.5) |
|---|---|---|
| 3 falhas e depois **senha correta** | **429 (bloqueado)** | **200 (entra)** |
| 5 logins válidos repetidos | 200 | 200 |
| senha incorreta | 401 | 401 |
| após estourar o limite, falha | 429 | 429 + `Retry-After` |

Não era o bcrypt, não era o banco, não era o `authPeakLimiter` (esse teria `limit: 600`). Era o `authLimiter` bloqueando na entrada.

### Arquivos alterados
- `backend/src/utils/loginAttempts.js` — **novo**: guarda de falhas por `(IP + hash do e-mail)`, aplicada **depois** da verificação da senha.
- `backend/src/controllers/authController.js` — `login` verifica a credencial **primeiro**; só falhas consomem o orçamento; sucesso limpa o contador; falha bloqueada → `429` + `Retry-After`.
- `backend/src/routes/auth.routes.js` — `/login` deixa de usar `authLimiter` (bloqueava na entrada) e passa a usar a guarda do controller + `authPeakLimiter`.
- `backend/src/middlewares/rateLimiter.js` — `authPeakLimiter` agora com `skipSuccessfulRequests: true` (onda legítima de logins não consome cota); `authLimiter` mantido para `register`/`forgot-password`.
- `backend/src/config/env.js` — `AUTH_FAILURE_WINDOW_MS` e comentários; `AUTH_RATE_LIMIT_MAX` continua 10 e **não foi aumentado**.

### Segurança preservada
- **Brute force continua limitado**: 10 falhas por `(IP + e-mail)` travam novas **tentativas falhas** por 15 min; `authPeakLimiter` (por IP, contando só falhas) limita flood; `apiLimiter` global mantido.
- **bcrypt não foi desativado nem reduzido** (`BCRYPT_ROUNDS` permanece 12, pool de workers intacto).
- Nenhum rate limiter removido; o de `/login` foi **substituído por um mais correto** (mesma proteção, sem lockout de senha válida).

### Comportamento antes/depois
| | Antes | Depois |
|---|---|---|
| Login válido após falhas | 429 (bloqueado) | **200** |
| Login válido repetido | 200 | 200 |
| Senha incorreta | 401 e consome cota | 401 e consome cota |
| Após estourar cota | 429 (mesmo com senha certa) | 429 só para **falhas** + `Retry-After` |
| Onda de 500 logins legítimos (1 NAT) | risco de 429 | não consome cota |

### Resultados dos testes (executados)
`node scripts/test-login-limiter.mjs` → **7 PASS / 0 FAIL**:
Teste 1 (válido→200), Teste 2 (inválido→401 consome), Teste 3 (10 falhas→429+Retry-After), Teste 4 (válido após falhas→200), Teste 4b (sucesso limpa contador), contraste com o limiter antigo, e onda 10→500 100% OK.

### Testes de concorrência (executados — camada de autenticação)
> Sem banco de teste neste sandbox, o teste de onda exercita **rate limiter + roteamento** com verificação de credencial simulada (sem bcrypt/DB). Os números acima/below medem essa camada, **não** o tempo do bcrypt nem do PostgreSQL.

| N | OK | 4xx | 5xx | net err | p50 | p95 | p99 | max |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 0 | 0 | 0 | 6,4 ms | 8,0 ms | 8,0 ms | 8,0 ms |
| 25 | 25 | 0 | 0 | 0 | 27,8 ms | 31,7 ms | 32,0 ms | 32,0 ms |
| 50 | 50 | 0 | 0 | 0 | 16,9 ms | 26,2 ms | 27,0 ms | 27,0 ms |
| 100 | 100 | 0 | 0 | 0 | 57,4 ms | 76,9 ms | 78,4 ms | 78,4 ms |
| 250 | 250 | 0 | 0 | 0 | 98,2 ms | 138,1 ms | 139,8 ms | 140,2 ms |
| 500 | 500 | 0 | 0 | 0 | 112,9 ms | 205,6 ms | 211,1 ms | 214,8 ms |

Contas distintas por requisição; sem criar usuários em produção.

---

## SORTEIO

### Arquivos alterados
- `frontend/src/styles/sorteio.css` — **novo** (todo o visual, classes `.raffle-*`, escopado).
- `frontend/src/components/Roulette.jsx` — roleta redesenhada (mesma lógica).
- `frontend/src/pages/admin/AdminSorteios.jsx` — palco/resultado/histórico/botões.
- `frontend/src/pages/Sorteios.jsx` — resultados públicos com o mesmo acabamento.

### Melhorias visuais
- **Cabeçalho** de destaque com prêmio, evento, status, elegíveis e vencedores (verde+dourado institucional).
- **Painel central de resultado** como elemento principal, com três estados: *pronto* → *sorteando* → *resultado*.
- **Roleta** premium: disco com paleta da marca, ponteiro dourado, hub, rótulos legíveis, giro mais longo e suave.
- Cartões de estatística, chips e tabela de histórico padronizados.

### Melhorias de UX
- **O vencedor só é revelado ao fim da animação** (antes era exibido assim que a API respondia). Há fallback por tempo para `prefers-reduced-motion`/aba em background.
- Botão principal com estados **“SORTEAR” → “Sorteando…” → “Sortear novamente”**, **desabilitado durante o giro** (bloqueia clique duplo; guarda extra no `doDraw`).
- `aria-live`/`role="status"` no resultado, `aria-label` na roleta e no botão; contraste alto; status não depende só de cor.

### Lógica preservada
`raffleApi.*` inalterados; o vencedor continua decidido no backend (`crypto.randomInt`, transação, índice único); elegibilidade, prêmio, repetição, histórico, auditoria e notificação intactos. Nenhum endpoint, permissão ou validação alterado. Não há campo de “número de bilhete” no modelo — por isso o destaque é o **nome do vencedor**, e não um número inventado.

### Responsividade
Breakpoints em `sorteio.css`: 2 colunas no desktop, 1 coluna ≤860px, ajustes ≤640px (fonte do resultado, hub, botões full-width, stats 2 colunas). Sem overflow horizontal; textos com `overflow-wrap`.

---

## PERFORMANCE
- **Login 10→500:** tabela acima (camada auth, local). **Produção/teste com DB+bcrypt: NÃO MEDIDO** (sem ambiente de teste). O script real é `load-test.mjs`/`test-login-limiter.mjs`.
- **V9.4 preservada:** cache público, ETag, Cache-Control, single-flight, projeções, índices, bcrypt worker pool, SSE, QR, PIX — todos intactos (suites abaixo).

### Suítes executadas
| Suíte | Resultado |
|---|---|
| Sintaxe (todos `.js`) | OK (0 falhas) |
| `test-login-limiter.mjs` | **7 PASS / 0 FAIL** |
| `test-performance.mjs` | **11 PASS / 0 FAIL** |
| `test-pix.mjs` | **17 PASS / 0 FAIL** |
| `test-timezone.mjs` | **9 PASS / 0 FAIL** |
| `test-qr-content.mjs` | **6 PASS / 0 FAIL** |
| `test-corrections-v94.mjs` | **17 PASS / 0 FAIL** |
| `test-http-v94.mjs` | **8 PASS / 0 FAIL** |
| `npm run build` (frontend) | **PASS** (0 erros) |

**Total backend: 75 PASS / 0 FAIL.**

---

## ALTERAÇÕES DE LAYOUT
```
Layout geral: PRESERVADO
Header: PRESERVADO
Sidebar: PRESERVADA
Eventos: PRESERVADOS
Atividades: PRESERVADAS
QR Code: PRESERVADO
Inscrições: PRESERVADAS
Sorteio: REDESENHADO
```
Confirmado pelo diff: apenas `auth*`, `rateLimiter`, `env`, `loginAttempts`, `Roulette`, `Sorteios`, `AdminSorteios` e o novo `sorteio.css`. **`global.css`, Header, Sidebar e demais páginas não foram tocados.**

## BANCO / MIGRATIONS
Nenhum `DROP`/reset/delete em massa. Nenhuma alteração de schema. **MIGRATION NECESSÁRIA: NÃO.** (a correção é só de código/limiter; o sorteio é só apresentação).

## RISCOS RESTANTES
1. O guard de falhas é **em memória por processo** (1 instância Render) — com múltiplas instâncias, migrar para armazenamento compartilhado (Redis) — igual ao cache/SSE atuais.
2. Os testes de onda medem a camada de autenticação, **não** bcrypt/DB; a validação final de 500 simultâneos deve ser feita no ambiente de teste.
3. `trust proxy`: `req.ip` depende da cadeia de proxies; o hash do e-mail garante o isolamento por identidade de qualquer forma.
