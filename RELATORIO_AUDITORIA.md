# Relatório de Auditoria Técnica — Mustangs Atlética / AcadeConnect

Auditoria completa (frontend, backend, banco e QR Code) com **correção de bugs** e **testes de ponta a ponta** executados em ambiente real (PostgreSQL 15 + Node 22 + React/Vite).

Data: 2026 · Escopo: código enviado em `AcadeConnect_auditoria_corrigido.zip`

---

## 1. Bugs encontrados

Foram reproduzidos em execução real (não apenas por leitura de código):

| # | Severidade | Bug | Evidência |
|---|-----------|-----|-----------|
| 1 | **Alta** | **Edição de evento não era persistida.** O frontend reenviava o objeto completo do GET (com `institution`, `organizer`, `activities`, `_count`, `capacityProgress`) e o backend repassava tudo direto ao Prisma. Resultado: `422 "Dados inválidos enviados ao banco"` e o registro antigo permanecia. | `PUT /api/events/:id` → 422; `GET` confirmava dados antigos |
| 2 | **Alta** | **`ApiErrorConflict` não existia** no `certificateService`. Ao negar certificado por falta de presença, o backend lançava `ReferenceError` e devolvia **500** em vez de 409 com a mensagem clara. | Log `ReferenceError: ApiErrorConflict is not defined`; resposta 500 |
| 3 | **Alta** | **Presença órfã / relatórios inconsistentes.** Escanear o QR de um participante sem inscrição na atividade criava uma `Attendance` sem `ActivityRegistration`. A lista da atividade não mostrava a pessoa e o resumo exibia **presentes > inscritos (200%)**. | Roster com 1 linha e resumo `{inscritos:1, presentes:2}` |
| 4 | **Média** | **IDOR em notificações.** `POST /api/notifications/:id/read` marcava como lida a notificação de **qualquer** usuário, sem checar o dono. | Usuário B marcou notificação do usuário A → 200 |
| 5 | **Alta** | **Câmera do “Modo telão” nunca abria.** O container `#telao-reader` só era renderizado depois de `setStarted(true)`, mas `new Html5Qrcode()` era chamado antes — o elemento não existia e o `start()` falhava. | Fluxo `AdminTelao` |
| 6 | **Média** | **Câmera do operador podia morrer após iniciar.** Ao ligar a câmera, o React re-renderizava e movia/recriava o `div` do leitor, destacando o `<video>` criado pelo `html5-qrcode`. | `AdminOperador` (dois ramos de JSX com `#qr-reader`) |
| 7 | **Média** | **Certificado com data errada (timezone).** O PDF usava `getDate()/getMonth()/getFullYear()` locais sobre datas salvas como meia-noite UTC. Em UTC-3 exibia o **dia anterior**. | PDF “realizado em 31/10” para evento em 01/11 |
| 8 | **Média** | **Filtro de relatórios quebrava / sempre zero.** `status` (status de *inscrição*) era aplicado em `Attendance.status` e em `Certificate.status` (enums diferentes). | `?status=CONFIRMED` → 422; presenças sempre 0 com filtro |
| 9 | **Média** | **Download de certificado quebrado em produção.** `downloadUrl` usava caminho fixo `/api/...`, ignorando `VITE_API_URL` (quando o backend está em outro domínio). | Certificados não baixavam no deploy |
| 10 | **Baixa** | **Paginação de atividades não funcionava** (lista completa exibida, paginação decorativa). | `AdminAtividades` |
| 11 | **Baixa** | **Registro em evento que exige atividade aceitava inscrição sem nenhuma atividade.** | `POST /registrations/:eventId` com `activityIds: []` |
| 12 | **Baixa** | **`updateInstitution` / `updateSpeaker` repassavam `req.body` inteiro ao Prisma** (mesma classe do bug #1: erro de validação e save descartado). | Leitura + teste de padrão |
| 13 | **Média** | **`registrationEnd` gravado à meia-noite no create.** O Joi convertia a data para `Date` antes do controller, e o `endOfDay: true` era perdido. Resultado: o prazo final fechava no **início** do dia no create e no **fim** do dia no update (janela de inscrição inconsistente). | `create` → `2026-03-10T00:00:00Z`; `update` → `2026-04-30T23:59:59.999Z` |

---

## 2. Bugs corrigidos (o que mudou)

- **`eventController.updateEvent`** — agora monta um *whitelist* apenas de colunas escalares graváveis, converte booleanos/strings do `FormData`, valida datas, ignora relações e regenera o `slug` único. Edição persiste de verdade.
- **`certificateService`** — troca `ApiErrorConflict` por `ApiError(409, ...)`; inclui `organizer` na consulta (responsável no PDF) e **conta presença apenas nas atividades que exigem presença**, evitando percentuais > 100%.
- **`attendanceService`** — ao registrar presença de quem não estava inscrito na atividade, cria a inscrição na atividade de forma idempotente (roster/relatórios consistentes, sem órfãos). Continua **sem exigir inscrição prévia**.
- **`attendanceController`** — a lista da atividade agora também inclui presenças legadas sem inscrição; o resumo usa a união (inscritos ∪ presentes) e limita o percentual a 100%.
- **`notificationController.markRead`** — `updateMany` com `{ id, userId }`; retorna 404 se a notificação não for do usuário.
- **`registrationController.registerForEvent`** — exige ao menos uma atividade quando o evento marca `requireActivityRegistration`.
- **`reportController`** — não mistura mais status de inscrição com status de presença/certificado; presentes = participantes distintos com presença; ausentes = inscritos − presentes; percentual limitado a 100%.
- **`pdf.js`** — datas do certificado em **UTC** (dia correto).
- **`utils/date.js`** — `parseDate` agora preserva o `endOfDay` também quando o valor já chega como `Date` (caso do Joi no create), deixando create e update consistentes.
- **`adminController.updateInstitution` / `speakerController.updateSpeaker`** — whitelist de campos.
- **`frontend/api/client.js` + `services.js`** — expõem `API_BASE_URL`; `downloadUrl` respeita `VITE_API_URL`.
- **`AdminEventoForm`** — `toForm` envia apenas campos editáveis (defesa extra).
- **`AdminAtividades`** — paginação real (client-side).
- **`AdminOperador` / `AdminTelao`** — container da câmera **sempre montado** e fora do fluxo de re-render; *stop/clear* aguardados; trava contra leitura duplicada; mensagens claras para **permissão negada** vs. câmera indisponível.

---

## 3. QR Code — situação, problema e correção

**Como estava:** o QR contém um token opaco de alta entropia (`AC<48 hex>`) gerado na inscrição (`Registration.qrToken`, único). O operador (ADMIN/ORGANIZER) escaneia e o backend valida tudo.

**Problemas encontrados no fluxo:** além dos bugs #3 (órfão), #5 e #6 (câmera), havia risco de inconsistência de relatórios.

**O que foi corrigido, etapa por etapa:**

1. **Geração** — mantida a arquitetura existente (`qrcode` no backend + `react-qr-code` no frontend). Nenhum dado sensível no QR.
2. **Exibição** — mantida a tela/modal “Meu QR Code” (`InscricaoDetail`, `EventDetail`). Botões e layout preservados.
3. **Leitura pela câmera** — `AdminOperador` e `AdminTelao` corrigidos: o `div` do leitor existe antes de criar o `Html5Qrcode` e **não é desmontado** por re-render. Fim de câmera: `stop()` + `clear()`. Erro de permissão tratado com mensagem específica.
4. **Detecção/envio** — leitura automática (fps 8–10) com trava para impedir submissões simultâneas; além do campo manual de token.
5. **Validação (100% backend)** — `POST /api/attendance/scan`: token existe? inscrição confirmada? atividade existe e é do **mesmo evento**? atividade/evento não cancelados/encerrados? duplicidade? Tudo no servidor.
6. **Registro da presença** — gravada em `Attendance` com `recordedAt`, `method = QR_CODE`, `operatorId`; agora **com a inscrição na atividade garantida** (sem órfãos).
7. **Confirmação** — “Presença registrada com sucesso!” com nome, código da inscrição e atividade; “Presença já registrada” na duplicidade; “QR Code inválido” no token desconhecido.

**Dependência de inscrição prévia em atividade:** removida do caminho de presença. Com `requireActivityRegistration = false` (padrão), qualquer inscrito no evento registra presença mesmo sem ter escolhido a atividade. Se o organizador **optar** por exigir atividade, aí sim é validado (regra de negócio explícita).

**Duplicidade:** bloqueada no backend e no banco (constraint única `@@unique([registrationId, activityId])` + verificação prévia).

---

## 4. Banco de dados

- **Persistência:** bug real de update de evento corrigido (o save era descartado por erro de validação do Prisma). Teste `criar → salvar → recarregar → editar → salvar → recarregar` passou (nome, datas e horário mantidos).
- **Datas/horários/timezone:** datas “somente dia” gravadas ao meio-dia UTC (dia escolhido preservado). Corrigido o único ponto que ainda usava fuso local: **data impressa no certificado**.
- **Relacionamentos:** `Attendance` deixou de gerar registros órfãos; resumos agora usam união inscritos/presentes.
- **Sem alteração de schema.** Nenhuma tabela nova, nenhuma migração destrutiva, dados existentes preservados. As correções são compatíveis com o banco atual.

---

## 5. Segurança

- **IDOR em notificações** corrigido (escopo por `userId`).
- **Validação sempre no backend** (o frontend não decide sucesso).
- **RBAC** mantido (scan/validação/registro apenas ADMIN/ORGANIZER).
- **Auto-cadastro nunca cria ADMIN/ORGANIZER** (verificado no código).
- **Sem SQL injection** (Prisma parametrizado), **Helmet**, **CORS restrito**, **rate limit** e **bcrypt** já presentes e preservados.

> Observação de segurança (não bloqueante): os PDFs de certificado ficam em `backend/uploads`, servido estaticamente. O acesso exige conhecer o código aleatório (mesmo nível de exposição da página pública de validação). Para produção de alto sigilo, mover para storage privado com URL assinada.

---

## 6. Testes realizados (ambiente real)

Subi PostgreSQL 15 + API + build do frontend e rodei scripts de ponta a ponta:

- Login admin; criação de evento e de atividade.
- **Editar evento via payload completo do frontend → 200 e persistido** (antes 422).
- Inscrição de participante com e **sem** atividade.
- **Scan QR (inscrito) → 201**; scan repetido → **409 “Presença já registrada”**; token inválido → **404**.
- **Scan de quem não estava na atividade → 201**, roster com as 2 pessoas, resumo `{inscritos:2, presentes:2}` (antes 1/2 e 200%).
- **Certificado sem presença → 409** com mensagem clara (antes 500); com `force` → 201; download do PDF → 200.
- **PDF com data correta** (`01/11/2026`, antes `31/10/2026`).
- **IDOR de notificação → 404** (antes 200).
- Filtros de relatório `CONFIRMED`/`CANCELLED` → válidos e coerentes.
- `npm run build` do frontend → **sucesso** (sem erros de import/compilação).
- `node --check` em todos os arquivos do backend → **sem erros de sintaxe**.

---

## 7. Problemas restantes (dependem de configuração externa)

1. **Deploy atual sem backend conectado.** Em `https://acade-connect.vercel.app`, `GET /api/health` retorna **404 NOT_FOUND** — o frontend chama `/api` na própria Vercel. É preciso definir, no build da Vercel, `VITE_API_URL=https://SEU-BACKEND/api` e liberar a origem no `CORS_ORIGINS` do backend. Sem isso, nenhuma tela carrega dados em produção.
2. **HTTPS obrigatório para a câmera.** `getUserMedia` só funciona em `https` (ou `localhost`). O deploy é HTTPS, então ao apontar para o backend correto a câmera funciona; em rede local use `https` ou `localhost`.
3. **E-mail desativado** (`EMAIL_ENABLED=false`): recuperação de senha/inscrição só aparecem no console. Configure SMTP no `.env`.
4. **Uploads em disco local**: em ambientes efêmeros (Render/Railway), banners/PDFs somem no redeploy. Migrar para S3/Cloudinary (`UPLOAD_DIR`/`UPLOADS_BASE_URL` já preparados).
5. **QR sem expiração**: o schema não tem campo de expiração. Se for requisito, é uma evolução (nova coluna + verificação), sem impacto nos dados atuais.

---

## 8. Verificação de datas (CRUD) — teste dedicado

Teste automatizado cobrindo criar → salvar → recarregar → editar → salvar → recarregar e exclusão, executado com o **servidor em `America/Sao_Paulo` (UTC-3)**:

- `event.startDate` / `endDate`: o dia escolhido é gravado e retornado **exatamente** (ex.: `2026-03-15T00:00:00.000Z`), sem "voltar um dia".
- `startTime`: preservado após criar, editar e recarregar (`19:30` → `20:15`).
- `registrationStart`: início do dia; **`registrationEnd`: fim do dia** (`23:59:59.999Z`) tanto no create quanto no update.
- `activity.date` + `startTime`/`endTime`: criados, editados e persistidos corretamente.
- **Exclusões:** atividade excluída some (404); evento **desativado** some da listagem/GET e bloqueia nova inscrição (409); evento **excluído permanentemente** some (404).
- **Exibição (frontend) em UTC-3:** `15/03/2026` para a data do evento; `createdAt` real aparece em horário local (`12:23` para `15:23Z`).
- **PDF do certificado:** data impressa correta (`01/11/2026`, sem o antigo erro `31/10/2026`).

Resultado: **29/29 verificações PASS** (incluindo o fuso brasileiro).

## Arquivos alterados (17)

```
backend/src/controllers/eventController.js
backend/src/controllers/attendanceController.js
backend/src/controllers/notificationController.js
backend/src/controllers/registrationController.js
backend/src/controllers/reportController.js
backend/src/controllers/adminController.js
backend/src/controllers/speakerController.js
backend/src/services/attendanceService.js
backend/src/services/certificateService.js
backend/src/utils/pdf.js
backend/src/utils/date.js
frontend/src/api/client.js
frontend/src/api/services.js
frontend/src/pages/admin/AdminEventoForm.jsx
frontend/src/pages/admin/AdminAtividades.jsx
frontend/src/pages/admin/AdminOperador.jsx
frontend/src/pages/admin/AdminTelao.jsx
```
