# AcadeConnect — Relatório de Implementação V9.1

**Objetivo:** reduzir o tráfego automático apontado na auditoria da V9 **sem mudar absolutamente nada de layout, fluxo, contratos de tela ou regras de negócio**.

A V9 já havia eliminado o polling pesado e criado um stream SSE compartilhado. A auditoria identificou que ainda sobravam três fontes de tráfego indireto:

1. **1 evento SSE → 3 requisições HTTP** (Header, DashboardLayout, useLiveConversation);
2. **polling de fallback sempre ativo** (5s → 60s) mesmo com SSE saudável;
3. **ausência de deduplicação** de chamadas GET iguais e revalidação de sessão sem limite.

A V9.1 ataca exatamente esses três pontos.

---

## 1. O que foi alterado

### 1.1 Centralização do estado ao vivo — `frontend/src/context/LiveDataContext.jsx` (novo)

Antes, **cada componente** era dono de buscar seu próprio contador:

```
SSE ─┬─ Header            → GET /notifications?limit=8
     ├─ DashboardLayout   → GET /conversations/unread-count
     └─ useLiveConversation → GET /conversations/:id/messages?since=
```

Agora existe **um único dono** dos dois contadores (notificações e mensagens não lidas), montado uma vez em `main.jsx` dentro do `AuthProvider`:

```
SSE ── LiveDataProvider ──┬─ notificações não lidas
                          └─ conversas não lidas
                                  │
                    (contexto) ───┴──► Header
                                       DashboardLayout
```

Regras de atualização (em ordem de prioridade):

| Evento SSE | Comportamento V9.1 | HTTP |
|---|---|---|
| `notification` (individual) | Insere a notificação recebida no topo (dedup por `id`) e incrementa o contador | **0** |
| `notification` (em lote) | Incrementa o contador | **0** |
| `message` / `conversation` **com** `unread` | Substitui o contador pelo valor recebido | **0** |
| `message` / `conversation` **sem** `unread` | Agenda **1** refresh debounced (1,5s) para toda a rajada | **1 por rajada** |
| Foco / aba visível | Só revalida se o dado estiver com mais de **120s** | eventual |
| Rede de segurança | Timer de **5 min**, pausado com a aba oculta | 1 / 5min |

> Resultado: em uma operação normal (SSE saudável), receber uma mensagem ou notificação **não gera nenhuma requisição HTTP**.

### 1.2 Backend — o evento passa a carregar a informação necessária

`backend/src/services/conversationService.js`

- `sendMessage` (admin → participante): o push SSE passa a incluir `unread`, o total atualizado do participante.
- `startConversationAsAdmin`: idem no evento `conversation`.
- `sendMessage` (participante → admins): como o total do staff é **global** (todas as conversas), não dá para embutir um número por evento. Em vez disso é emitido um evento `conversation` leve; cada aba do staff agenda **um único** refresh debounced para a rajada inteira.

Nenhum endpoint, payload de API ou regra de autorização mudou — apenas o **payload do SSE** ficou mais rico.

### 1.3 Polling do fio de conversa — `frontend/src/hooks/useLiveConversation.js`

O hook continua incremental e adaptativo, mas agora **respeita a saúde do SSE**:

| Situação | Intervalo |
|---|---|
| SSE conectado (rede de segurança) | **120s → 600s** (backoff) |
| SSE caído (fallback real) | **5s → 60s** (backoff) |

Também ganhou:
- **guarda de requisição em voo** — o gatilho do SSE e o timer compartilham um único lock, então uma rajada de eventos nunca empilha requisições;
- **catch-up no reconectar** — ao voltar o SSE, faz um refresh para recuperar o que passou offline.

### 1.4 Deduplicação de GET — `frontend/src/api/client.js`

- Requisições GET idênticas (`url` + `params`) **reaproveitam a promise em voo** e um cache de **1s**.
- Qualquer mutação (POST/PUT/PATCH/DELETE) **invalida o cache**, então nunca há leitura obsoleta depois de uma escrita.
- Endpoints vivos (`/notifications`, `/notifications/unread-count`, `/conversations/unread-count`, `/conversations/:id/messages`) usam `fresh: true` e **sempre** vão ao servidor.
- O cache é limitado (máx. 200 chaves) para não crescer em sessões longas.

Isso elimina o cenário "duas telas montam juntas e fazem a mesma chamada duas vezes".

### 1.5 Estado da conexão SSE — `frontend/src/api/realtime.js`

- `isRealtimeConnected()` e `subscribeRealtimeState(handler)` expõem se o stream está aberto, permitindo que o hook de conversa saiba quando realmente precisa do fallback.
- A conexão continua **singleton**: uma única conexão por aba, vários ouvintes.

### 1.6 Header — `frontend/src/components/Header.jsx`

- Deixou de fazer `GET /notifications` a cada evento `message` (a V9 recarregava as 8 notificações a cada mensagem recebida).
- Passou a consumir o `LiveDataContext`.
- Ao abrir o sino, revalida respeitando o TTL (≥60s).
- Clicar em uma notificação agora marca como lida localmente (contador decrementa sem esperar resposta).

### 1.7 DashboardLayout — `frontend/src/layouts/DashboardLayout.jsx`

- Removido o `setInterval` de 120s e a refetch a cada evento SSE.
- O badge vem do `LiveDataContext`, atualizado por evento (ou por 1 refresh debounced por rajada).

### 1.8 Sessão em rajada de 403 — `frontend/src/context/AuthContext.jsx`

- Vários 403 simultâneos (papel desatualizado no navegador) disparavam **um `/auth/me` por requisição recusada**.
- Agora a revalidação é **limitada a 1 a cada 30s**.

---

## 2. Antes × Depois (estimativa de carga)

Cenário da auditoria: **100 usuários com conversa aberta**, SSE saudável, sem mensagens novas.

| Fonte | V9 | V9.1 |
|---|---|---|
| Polling do fio (5→60s) | ~100 req/min (após backoff) | ~0,8 req/min (120→600s) |
| `unread-count` (timer) | 1000 / 120s ≈ 8,3 req/min p/ 1000 usuários | ~0,3 req/min (timer 5 min + TTL de foco) |
| Nova mensagem recebida | 3 HTTP por evento (Header + unread + messages) | **0 HTTP** (conversa direta) / 1 por rajada (staff) |
| Voltar para a aba | 1 refetch do Header sempre | só se >120s |
| GETs duplicados ao montar telas | 1 por componente | 1 total (cache/coalescência) |
| Rajada de 403 | 1 `/auth/me` por erro | 1 a cada 30s |

Em repouso, a queda é de **uma a duas ordens de magnitude**; com mensagens em fluxo, o custo por evento cai de 3 requisições para **zero**.

---

## 3. O que **não** foi alterado (conforme item 12 da auditoria)

- PIX, QR Code, inscrições, presenças, loja, pedidos, sorteios, cupons, certificados;
- layout, CSS, rotas, textos e contratos de API;
- limites administrativos de `GET /events?limit=100/200` — são carregamentos de página (não polling) e continuam um ponto **opcional** a tratar numa próxima iteração;
- `GET /registrations/mine` dentro de `EventDetail` — a fusão com `GET /events/:id` exigiria mudança de contrato do backend, deixada de fora deliberadamente.

---

## 4. Arquivos tocados

| Arquivo | Tipo |
|---|---|
| `frontend/src/context/LiveDataContext.jsx` | **novo** |
| `frontend/src/api/client.js` | dedupe GET + invalidação |
| `frontend/src/api/realtime.js` | estado da conexão |
| `frontend/src/api/services.js` | `fresh` nos endpoints vivos |
| `frontend/src/hooks/useLiveConversation.js` | polling consciente do SSE |
| `frontend/src/components/Header.jsx` | consome contexto |
| `frontend/src/layouts/DashboardLayout.jsx` | consome contexto |
| `frontend/src/context/AuthContext.jsx` | throttle de 403 |
| `frontend/src/main.jsx` | monta o provider |
| `backend/src/services/conversationService.js` | `unread` no SSE + evento staff |

O diff completo está em `CORRECOES_V9_1.diff`.

---

## 5. Verificação

- `node --check backend/src/services/conversationService.js` — OK.
- `npm run build` no frontend — OK (build Vite concluído sem erros).
- Nenhuma mudança de schema Prisma, migration ou variável de ambiente.

## 6. Próximos passos sugeridos (fora do escopo da V9.1)

1. Reduzir os `limit: 100/200` das telas administrativas, trocando por seleção paginada/pesquisável.
2. Embutir a situação de inscrição do usuário em `GET /events/:id` para eliminar `GET /registrations/mine`.
3. Se o backend for escalado horizontalmente (várias instâncias), trocar o `EventEmitter` em memória por Redis pub/sub — o contrato de SSE do cliente já está pronto para isso.
