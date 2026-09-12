# 🎓 AcadeConnect — Plataforma de Gestão de Eventos Acadêmicos

Sistema web completo, profissional e responsivo para **gerenciamento de eventos acadêmicos, inscrições, participação e controle de presença** — com QR Code e emissão/validação de certificados.

Identidade visual **própria** (AcadeConnect). Não copia logotipo, marca ou layout de nenhuma instituição. Inspirado apenas no **conceito** de evento acadêmico: educação, conhecimento, participação e comunidade.

---

## ✨ O que o sistema faz

| Papel | Funcionalidades |
|-------|-----------------|
| **Participante** | Criar conta, login, editar perfil, explorar eventos, inscrever-se, escolher atividades, receber QR Code, registrar presença, acompanhar histórico, baixar e validar certificados |
| **Organizador** | Criar/editar eventos, gerenciar atividades e palestrantes, controlar inscrições e presenças, ver relatórios e estatísticas |
| **Administrador** | Tudo do organizador + gestão de usuários, permissões (RBAC), instituições, logs de auditoria e configurações de certificado |

**Fluxos completos implementados (não é mockup):**
- Inscrição com número único (`EVT-2026-000123`) e QR Code
- Presença via **QR Code escaneado pela câmera** (operador) ou **registro manual**
- Validação **100% no backend** (reuso, duplicidade, QR adulterado, atividade/evento incorretos)
- Certificados em **PDF** com código único (`CERT-2026-0000123`) e **QR Code de validação pública**
- Dashboard com **dados reais do banco** (nenhum número fake)
- Exportação CSV / XLSX
- Notificações, dark/light mode, LGPD (exclusão de conta), auditoria

---

## 🧰 Stack tecnológica

**Frontend:** React 18 · Vite · React Router · Lucide React · Recharts · react-qr-code · html5-qrcode · Axios

**Backend:** Node.js · Express 4 · Prisma ORM · PostgreSQL

**Autenticação/Segurança:** JWT · bcrypt · Helmet · CORS · Rate limiting · Validação com Joi · RBAC

**Extras:** PDFKit (certificados) · ExcelJS (XLSX) · `qrcode` (backend) · Nodemailer (e-mail, opcional)

---

## 📁 Estrutura do projeto

```
academica/
├── package.json               # Scripts orquestrados (dev, build, prisma...)
├── README.md
├── .gitignore
│
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma      # Modelagem completa (User, Event, Activity, ...)
│   │   ├── migrations/        # Migrations geradas
│   │   └── seed.js            # Dados de demonstração
│   └── src/
│       ├── server.js          # Entry point
│       ├── app.js             # Express app (helmet, cors, rate limit, uploads)
│       ├── config/            # env, prisma, multer
│       ├── controllers/       # auth, user, event, activity, speaker, registration,
│       │                      # attendance, certificate, notification, admin, report, export
│       ├── routes/            # rotas REST
│       ├── middlewares/       # auth (JWT), authorize (RBAC), validate (Joi),
│       │                      # errorHandler, notFound, rateLimiter
│       ├── services/          # auditoria, notificações, e-mail, certificados, presença
│       ├── utils/             # apiError, apiResponse, asyncHandler, codes, qr, pdf, export
│       └── validations/       # schemas Joi
│
└── frontend/
    ├── package.json
    ├── vite.config.js         # proxy /api e /uploads -> backend
    ├── .env.example
    ├── index.html             # SEO (title, meta, OG, favicon)
    └── src/
        ├── main.jsx / App.jsx # Rotas (lazy loading / code splitting)
        ├── api/               # client axios + services
        ├── components/        # ui, Overlay (Modal/Confirm), DataTable, Cards, Header, Footer, Logo
        ├── contexts/          # Auth, Theme (dark/light), Toast
        ├── hooks/             # useApi
        ├── layouts/           # Public, Dashboard (participante), Admin (sidebar)
        ├── pages/             # públicas, participante e admin
        └── styles/global.css  # design system (CSS variables, light/dark, responsivo)
```

---

## ✅ Requisitos

- **Node.js** ≥ 18 (recomendado 20+)
- **PostgreSQL** ≥ 13
- npm (v9+)

---

## 🚀 Instalação

```bash
# 1. Clone/descompacte o projeto e entre nele
cd academica

# 2. Instale dependências (backend + frontend)
npm run setup
# ou, manualmente:
#   cd backend && npm install
#   cd frontend && npm install
```

---

## 🗄️ Configuração do banco de dados

### Criar o banco (PostgreSQL)

```bash
sudo -u postgres psql -c "CREATE USER app WITH PASSWORD 'sua_senha';"
sudo -u postgres psql -c "CREATE DATABASE academica OWNER app;"
# permitir criar banco temporário (shadow DB) para migrations dev:
sudo -u postgres psql -c "ALTER ROLE app CREATEDB;"
```

### Configurar variáveis de ambiente

```bash
# Backend
cp backend/.env.example backend/.env
# edite backend/.env e preencha DATABASE_URL, JWT_SECRET, etc.

# Frontend (opcional — o proxy já funciona em dev)
cp frontend/.env.example frontend/.env.local
```

Exemplo de `backend/.env`:

```env
PORT=5000
DATABASE_URL=postgresql://app:sua_senha@localhost:5432/academica
JWT_SECRET=coloque-uma-string-longa-e-aleatoria
APP_URL=http://localhost:5173
API_URL=http://localhost:5000/api
```

> ⚠️ **Nunca** versionar o `.env`. O arquivo `.gitignore` já o ignora. Apenas o `.env.example` é commitado.

---

## 🔷 Prisma (migrations + seed)

```bash
cd backend

# Gerar o cliente Prisma
npx prisma generate

# Aplicar as migrations (cria o schema no banco)
npx prisma migrate dev

# (Em produção, use: npx prisma migrate deploy)

# Popular com dados de demonstração
npm run prisma:seed
```

### Contas de demonstração criadas pelo seed

| Papel | E-mail | Senha |
|-------|--------|-------|
| **Administrador** | `admin@demo.com` | `Admin@12345` |
| **Organizador** | `organizador@demo.com` | `Organizador@12345` |
| **Participante** | `participante@demo.com` | `Participante@12345` |

O seed cria **3 eventos** (cada um com atividades, palestrantes, participantes, inscrições, presenças e certificados) para você testar tudo imediatamente.

> As senhas acima são apenas para **ambiente local/demonstração**. Em produção, troque-as ou use senhas fortes.

---

## ▶️ Como executar

### Backend (terminal 1)

```bash
cd backend
npm run dev        # inicia em http://localhost:5000
```

Health check: `http://localhost:5000/api/health`

### Frontend (terminal 2)

```bash
cd frontend
npm run dev        # inicia em http://localhost:5173
```

Abra **http://localhost:5173** no navegador. O Vite faz proxy de `/api` e `/uploads` para o backend automaticamente.

> Para rodar os dois de uma vez na raiz: `npm run dev`.

---

## 🧪 Como testar (passo a passo)

### Como **Administrador**
1. Acesse `http://localhost:5173/login`, entre com `admin@demo.com` / `Admin@12345`
2. No menu lateral (ou dropdown), abra o **Painel admin**
3. **Dashboard** mostra estatísticas e gráficos com dados reais
4. **Eventos → Criar evento** → preencha o formulário e salve
5. **Atividades → Criar atividade** (vinculada a um evento e a um palestrante)
6. **Controle de presença** → selecione evento + atividade → **Ligar câmera** e escaneie o QR Code de um participante (ou use **Registro manual** buscando pelo nome)
7. **Certificados → Gerar automáticos** (ou emita manualmente)
8. **Relatórios** → filtre e exporte CSV

### Como **Participante**
1. Crie uma conta em `/cadastro` (ou entre com `participante@demo.com`)
2. **Eventos →** abra um evento → selecione atividades → **INSCREVER-SE**
3. Receba o número da inscrição e o **QR Code**
4. Em **Minha área → Minhas inscrições → Ver inscrição → Exibir QR Code**
5. No local do evento, o organizador escaneia o QR Code e sua presença é registrada
6. Após cumprir os requisitos, baixe o **certificado** em **Certificados**
7. Valide o certificado publicamente em `/validar-certificado`

### Como testar o QR Code / presença sem câmera
- Na página **Controle de presença**, campo "digite o código do QR (ou token)": cole o `qrToken` (disponível na resposta da API) ou use o **Registro manual** pesquisando pelo nome do participante.

---

## 📦 Build de produção

```bash
cd frontend
npm run build          # gera dist/ com code splitting
npm run preview        # opcional: testar o build
```

O backend não precisa de build (`npm run start`).

---

## ☁️ Deploy (Vercel / Render / Railway / Supabase / Fly.io)

### Banco (Supabase / Railway / Neon)
1. Crie um banco PostgreSQL
2. Pegue a `DATABASE_URL` e coloque na variável de ambiente do backend
3. Execute `npm run prisma:migrate:deploy` (ou `npx prisma migrate deploy`)

### Backend (Render / Railway / Fly.io)
1. Build command: `cd backend && npm install && npx prisma generate`
2. Start command: `npm --prefix backend run start`
3. Variáveis: `DATABASE_URL`, `JWT_SECRET`, `APP_URL` (URL do frontend), `CORS_ORIGINS` (URL do frontend), `API_URL`
4. Configure o **storage** de uploads (bucket S3) — hoje os arquivos vão para `UPLOAD_DIR` local

### Frontend (Vercel / Netlify)
1. Build command: `npm --prefix frontend run build`
2. Output: `frontend/dist`
3. Variável: `VITE_API_URL=https://seu-backend.com/api`
4. Se usar subdomínios diferentes, garanta que o CORS do backend inclua a origem do frontend

---

## 🔒 Segurança implementada

- Senhas com **bcrypt** (cost 12)
- **JWT** assinado, expiração configurável; suporte a **cookie HttpOnly** (produção) ou **Authorization header**
- **Helmet** (headers de segurança), **CORS** restrito por origem
- **Rate limiting** global e reforçado no login (anti brute-force)
- Validação de entrada com **Joi** e sanitização
- Proteção contra SQL injection via **Prisma ORM** (queries parametrizadas)
- **XSS** mitigado (React escapa por padrão; Helmet)
- **RBAC** (ADMIN / ORGANIZER / PARTICIPANT) em todos os endpoints
- **AuditLog** para ações administrativas (login, criação/alteração/exclusão, presença, certificado, usuários)
- Nenhum segredo/senha/API key no código — tudo via `.env`

### LGPD
- Política de Privacidade e Termos de Uso (páginas)
- Consentimento na criação de conta
- **Exclusão de conta** com anonimização de dados pessoais
- Minimização de dados (apenas o necessário)

---

## 🔌 E-mail

O envio de e-mails (confirmação de cadastro/inscrição, lembrete, certificado, recuperação de senha) usa **Nodemailer** com templates HTML profissionais. Para ativar:

```env
EMAIL_ENABLED=true
EMAIL_HOST=smtp.seu-provedor.com
EMAIL_PORT=587
EMAIL_USER=seu-email
EMAIL_PASSWORD=sua-senha-app
EMAIL_FROM=AcadeConnect <no-reply@dominio.com>
```

Com `EMAIL_ENABLED=false` (padrão), os e-mails são apenas logados no console do backend — perfeito para testes locais.

---

## 📄 Endpoints principais (REST)

```
POST  /api/auth/register            POST  /api/auth/login
POST  /api/auth/logout              GET   /api/auth/me
POST  /api/auth/forgot-password     POST  /api/auth/reset-password

GET   /api/events                   GET   /api/events/:idOrSlug
POST  /api/events                   PUT   /api/events/:id
DELETE /api/events/:id              POST  /api/events/:id/duplicate
POST  /api/events/:id/close         (encerrar + emitir certificados automáticos)

GET   /api/events/:eventId/activities
POST  /api/activities               PUT   /api/activities/:id
DELETE /api/activities/:id

POST  /api/registrations/:eventId   GET  /api/registrations/me
GET   /api/registrations/:id        DELETE /api/registrations/:id
POST  /api/registrations/:id/activities

POST  /api/attendance/scan          (QR Code)         POST /api/attendance/validate
POST  /api/attendance/manual        GET  /api/attendance/activity/:activityId
GET   /api/attendance/summary/:eventId  GET  /api/attendance/participants/search

GET   /api/certificates/me          GET  /api/certificates/validate/:code
POST  /api/certificates/issue       POST /api/certificates/auto/:eventId
GET   /api/certificates/:id/download

GET   /api/notifications
GET   /api/admin/dashboard          GET   /api/admin/users
POST  /api/admin/users              GET   /api/admin/registrations
GET   /api/admin/reports            POST  /api/admin/export/:type
GET   /api/admin/logs               GET   /api/admin/institutions
```

Todas as respostas usam envelope padronizado: `{ success, message, data, meta }`.

---

## 🧩 Modelagem (Prisma)

Entidades principais com relacionamentos e timestamps (`createdAt`/`updatedAt`):

```
Institution 1—N User · 1—N Event · 1—N Speaker
User 1—N Registration 1—N Event
Event 1—N Activity (tipos: PALESTRA, MINICURSO, WORKSHOP, MESA_REDONDA, CURSO, OFICINA, NETWORKING, PRATICA, OUTRO)
Registration N—N Activity (via ActivityRegistration)
Attendance (registration + activity, unique) · métodos QR_CODE/MANUAL/IMPORTACAO/ADMIN
Certificate (código único + QR de validação)
Notification · AuditLog
```

Regras de negócio implementadas no **backend**:
1. Sem inscrição duplicada no mesmo evento (unique constraint)
2. Sem presença sem inscrição válida
3. Sem presença duplicada na mesma atividade (unique constraint + validação)
4. Atividade encerrada/cancelada não aceita presença
5. Evento encerrado/cancelado não aceita novas inscrições
6. Atividade/evento lotado impede novas inscrições
7. Só usuários autorizados (ADMIN/ORGANIZER) registram presença manual
8. Só autorizados emitem certificados
9. Certificado com código único
10. Certificado emitido só quando os critérios (percentual de presença) são atendidos — ou por força do admin

---

## 🔭 Melhorias futuras (arquitetura preparada)

- Múltiplas instituições e múltiplos admins (já modelados)
- Aplicativo mobile / PWA
- Notificações push
- Login Google / OAuth
- Pagamentos para eventos pagos
- Inscrição individual em atividades (já existe endpoint)
- API pública com tokens
- Storage de uploads em S3/Cloudinary
- Check-in por biometria (apenas se legalmente apropriado)
- Fila de e-mails (BullMQ) e agendamento de lembretes

---

## 🧑‍💻 Licença

Projeto de demonstração/estudo. Uso livre para fins educacionais e institucionais. Desenvolvido com identidade visual própria.
