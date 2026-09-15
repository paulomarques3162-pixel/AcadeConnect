# Implementação — Sorteios, Pagamentos PIX, Loja, Cupons, Pedidos e Comunicação

Documento técnico das novas funcionalidades do AcadeConnect / Mustangs Atlética.
**Nenhuma funcionalidade existente foi removida e o layout atual foi preservado.**
As novas telas reutilizam os componentes já existentes (Card, Button, DataTable, Modal,
StatusBadge, Field, etc.).

---

## 1. Banco de dados

### Tabelas reutilizadas
`User`, `Event`, `Activity`, `Registration`, `ActivityRegistration`, `Attendance`,
`Certificate`, `Notification`, `AuditLog`, `Institution`, `Speaker`.

- **Elegibilidade do sorteio** usa `Registration` + `Attendance` + `User.deletedAt`.
- **QR de entrada** continua usando `Registration.qrToken`.
- **Auditoria** e **notificações** reutilizam `AuditLog` e `Notification`.

### Novos enums
`PaymentStatus { PENDING, PAID, EXPIRED, CANCELLED, REFUNDED }`,
`ProductStatus { ACTIVE, INACTIVE }`, `CouponType { PERCENT, FIXED }`,
`OrderStatus { PENDING, PAID, CANCELLED, EXPIRED }`,
`RaffleStatus { OPEN, CLOSED, CANCELLED }`,
`ConversationStatus { OPEN, RESOLVED }`.

### Campos novos em tabelas existentes (aditivos, com default/nulo)
| Tabela | Campo | Detalhe |
|---|---|---|
| `Event` | `isPaid` | `Boolean @default(false)` |
| `Event` | `priceCents` / `minPriceCents` / `maxPriceCents` | `Int?` (centavos) |
| `Registration` | `qrActive` | `Boolean @default(true)` |

### Tabelas novas (10)
`PixConfig`, `Payment`, `Product`, `Coupon`, `Order`, `OrderItem`,
`Conversation`, `Message`, `Raffle`, `RaffleWinner`.

### Migration (1, incremental, segura para banco populado)
`backend/prisma/migrations/20260915142447_add_raffle_payment_store_communication/migration.sql`
- `CREATE TYPE` dos 6 enums;
- `ALTER TABLE ... ADD COLUMN` (somente colunas nullable/`DEFAULT` — não remove nada);
- `CREATE TABLE` + índices + FKs;
- **Sem** `DROP`, **sem** reset, **sem** `db push --force-reset`.

> **Validação:** aplicada em banco com dados reais de teste; contagens de
> `User`/`Event`/`Registration` mantidas e defaults (`isPaid=false`, `qrActive=true`)
> preenchidos sem alterar registros.

---

## 2. Backend

### Services novos
`pixService`, `paymentService`, `raffleService`, `productService`, `couponService`,
`orderService`, `conversationService`.
### Controllers novos
`pixController`, `paymentController`, `raffleController`, `productController`,
`couponController`, `orderController`, `conversationController`.
### Validations novas
`pixSchemas`, `paymentSchemas`, `raffleSchemas`, `productSchemas`, `couponSchemas`,
`orderSchemas`, `conversationSchemas` (Joi). Eventos ganharam os campos de pagamento em
`schemas.js`.
### Utilitários
`utils/pix.js` (BR Code EMV + CRC16/CCITT-FALSE), `utils/pdf.js` (`buildOrderReceiptPdf`),
`utils/codes.js` (`generatePaymentCode`, `generateOrderCode`).

### Rotas novas
| Método | Rota | Acesso |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/pix`, `/api/pix/:id` | ADMIN |
| GET | `/api/payments/mine`, `/api/payments/:id` | autenticado |
| GET | `/api/payments/admin/list` | ADMIN/ORGANIZER |
| POST | `/api/payments/:id/confirm`, `/api/payments/:id/status` | ADMIN/ORGANIZER |
| GET/POST | `/api/raffles`, `/api/raffles/:id` | ADMIN/ORGANIZER |
| GET | `/api/raffles/:id/eligible` | ADMIN/ORGANIZER |
| POST | `/api/raffles/:id/draw`, `/api/raffles/:id/status` | ADMIN/ORGANIZER |
| GET | `/api/products`, `/api/products/:id` | público |
| GET | `/api/products/admin/list` | ADMIN/ORGANIZER |
| POST/PUT/DELETE | `/api/products`, `/api/products/:id` | ADMIN/ORGANIZER (upload de imagem reutilizado) |
| GET | `/api/coupons/public` | autenticado |
| POST | `/api/coupons/validate` | autenticado |
| GET/POST/PUT/DELETE | `/api/coupons`, `/api/coupons/:id` | ADMIN/ORGANIZER |
| POST | `/api/orders` | autenticado |
| GET | `/api/orders/mine`, `/api/orders/:id` | autenticado (ownership) |
| GET | `/api/orders/:id/receipt` | autenticado (ownership) — PDF |
| POST | `/api/orders/:id/pay` | autenticado (dono) |
| GET | `/api/orders/admin/list` | ADMIN/ORGANIZER |
| POST | `/api/orders/:id/status` | ADMIN/ORGANIZER |
| GET | `/api/conversations/admins`, `/home/mine` | autenticado |
| GET | `/api/conversations/admin/list` | ADMIN/ORGANIZER |
| POST | `/api/conversations` (iniciar), `/:id/messages`, `/:id/read` | autenticado |
| POST | `/api/conversations/:id/status` | ADMIN/ORGANIZER |
| POST | `/api/registrations/:id/payment` | dono |
| POST | `/api/registrations/:id/qr` | ADMIN/ORGANIZER |
| PUT | `/api/events` (campos de pagamento) | ADMIN/ORGANIZER |
| QR existente | `/api/attendance/scan` | ADMIN/ORGANIZER (agora com camada de pagamento) |

---

## 3. Pagamento (PIX) e QR de entrada

- **Evento gratuito:** fluxo idêntico ao anterior (QR normal).
- **Evento pago:** ao se inscrever, o backend cria `Payment` (`PENDING`) com o valor do
  evento. O QR de entrada **só é aceito** quando existe `Payment.status = PAID` e
  `Registration.qrActive = true`.
- **PIX:** `utils/pix.js` gera o payload EMV BR Code (com CRC16). O QR e o “copia e cola”
  usam o **mesmo payload**. **Não há integração bancária** — a confirmação é **manual**
  pelo administrador (`PENDING → PAID`), nunca automática pelo clique do usuário.
- **Controle administrativo:** confirmar, cancelar, estornar, expirar, regenerar/
  invalidar/reativar QR. Toda ação é auditada.
- **Valores:** sempre em **centavos (Int)**; o backend recalcula e valida faixa
  (mínimo/máximo) — nunca confia no frontend.

### Status de pagamento
`PENDING`, `PAID`, `EXPIRED`, `CANCELLED`, `REFUNDED`.

### Status de pedido
`PENDING`, `PAID`, `CANCELLED`, `EXPIRED`.

---

## 4. Sorteio

- **Elegíveis:** inscrições `CONFIRMED` do evento, `User.deletedAt = null` e **ao menos
  uma presença `PRESENT`** em `Attendance`.
- **Sem repetição (padrão):** quem já venceu o mesmo sorteio sai da lista
  (`allowRepeat=false`). Configurável por sorteio.
- **Algoritmo:** o vencedor é escolhido no **backend** com `crypto.randomInt`, dentro de
  transação. A roleta do frontend é **apenas animação** e para no vencedor retornado.
- **Concorrência:** índice único `@@unique([raffleId, userId])` impede duplicidade.
- **Histórico:** `RaffleWinner` guarda prêmio (snapshot), vencedor, data/hora, responsável
  e quantidade de elegíveis no momento. Nunca é sobrescrito.
- **Auditoria/Notificação:** criação, execução e mudança de status são auditadas; o
  vencedor recebe notificação.

---

## 5. Produtos, Cupons e Pedidos

- **Produtos:** CRUD com upload reaproveitado (`upload.single('image')`), status
  `ACTIVE/INACTIVE`, estoque opcional, remoção lógica (`deletedAt`).
- **Cupons:** `PERCENT` ou `FIXED`, validade, `maxUses`/`usedCount`, valor mínimo,
  ativo/inativo e remoção lógica. Validação **no backend**.
- **Pedidos:** preço, desconto e total calculados no servidor; `OrderItem` guarda
  **snapshot** (`productName`, `unitPriceCents`, `quantity`, `subtotalCents`) — mudar o
  produto depois não altera o histórico.
- **Concorrência:** criação do pedido + baixa de estoque + incremento de cupom em
  `$transaction`, com checagem condicional (`stock >= qty`, `usedCount < maxUses`).
- **Comprovante:** PDF (`buildOrderReceiptPdf`) com itens, desconto, total, PIX e QR —
  **não é boleto bancário**.
- **Pagamento:** apenas PIX, usando a chave ativa.

---

## 6. Comunicação

- `Conversation` (`OPEN`/`RESOLVED`) + `Message` (remetente e papel).
- **Ownership validado no backend:** participante só acessa a própria conversa; admin vê
  as autorizadas. Testado contra IDOR.
- Respostas geram notificação pelo sistema existente.

---

## 7. Frontend

### Abas administrativas novas
`Sorteios`, `Pagamentos`, `PIX`, `Produtos`, `Cupons`, `Pedidos`, `Comunicação`.
### Área do usuário nova
`Loja`, `Cupons`, `Meus pedidos`, `Pagamentos`, `Comunicação`
(integradas aos itens já existentes: Minhas inscrições, Certificados, Perfil).
### Componentes novos
`Roulette.jsx` (roleta visual), `PixCard.jsx` (QR PIX + copia e cola + status).
### Alterações pontuais em telas existentes
- `AdminEventoForm`: seção “Pagamento” (evento pago, valor, mínimo, máximo).
- `EventDetail`: mostra “Pagamento: PIX/Gratuito” e, em evento pago, exibe o PIX após a
  inscrição (o QR só aparece quando liberado).
- `InscricaoDetail`: status de pagamento, botão “Gerar PIX”, PIX do evento e QR **somente**
  quando liberado.
- `App.jsx`, `AdminLayout`, `DashboardLayout`: novas rotas/itens de menu, mantendo o
  padrão visual.

**Layout:** inalterado (apenas classes CSS novas e escopadas para a roleta e o chat).

---

## 8. Segurança

- Autorização por `role` no backend (não apenas esconder botão no frontend).
- Ownership em pedidos, pagamentos e conversas (sem IDOR).
- Preço, desconto, total, valor do evento e resultado do sorteio — **sempre** no backend.
- Upload reaproveitado, com validação de tipo/tamanho já existente.
- Tokens de QR/institutos permanecem opacos (não usam id/email).
- Auditoria (`AuditLog`) em ações críticas: sorteios, PIX, produtos, cupons, pedidos,
  pagamentos e QR.

---

## 9. Testes (banco PostgreSQL limpo + servidor real)

| Suite | Resultado |
|---|---|
| Regressão (login, eventos, atividade, inscrição, QR câmera/manual, certificados, relatórios, RBAC, reset, avatar) | **24 PASS / 0 FAIL** |
| Novas funcionalidades (PIX/CRC, evento pago, gate de QR, sorteio, produtos, cupons, pedidos, comunicação/IDOR) | **49 PASS / 0 FAIL** |
| `npm run build` (frontend) | **PASS** |
| `node --check` (backend) | **PASS** |
| Migração em banco populado | **PASS** (dados preservados) |

**Total: 73 PASS / 0 FAIL.**

---

## 10. Como aplicar

```bash
# backend (aplica SOMENTE a migration nova; não reseta nada)
cd backend
npx prisma migrate deploy
npx prisma generate

# frontend
cd ../frontend
npm run build
```

Configure a chave PIX ativa em **Admin → PIX** antes de usar eventos pagos/pedidos.
