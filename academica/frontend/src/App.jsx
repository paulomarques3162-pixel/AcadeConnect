import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Spinner } from './components/ui';

// Lazy-loaded pages for code splitting / performance.
const Home = lazy(() => import('./pages/Home'));
const Events = lazy(() => import('./pages/Events'));
const EventDetail = lazy(() => import('./pages/EventDetail'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ValidateCertificate = lazy(() => import('./pages/ValidateCertificate'));
const StaticPage = lazy(() => import('./pages/StaticPage'));

const MinhaArea = lazy(() => import('./pages/participant/MinhaArea'));
const MinhasInscricoes = lazy(() => import('./pages/participant/MinhasInscricoes'));
const InscricaoDetail = lazy(() => import('./pages/participant/InscricaoDetail'));
const Perfil = lazy(() => import('./pages/participant/Perfil'));
const Certificados = lazy(() => import('./pages/participant/Certificados'));
const CertificadoDetail = lazy(() => import('./pages/participant/CertificadoDetail'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminEventos = lazy(() => import('./pages/admin/AdminEventos'));
const AdminEventoForm = lazy(() => import('./pages/admin/AdminEventoForm'));
const AdminAtividades = lazy(() => import('./pages/admin/AdminAtividades'));
const AdminAtividadeForm = lazy(() => import('./pages/admin/AdminAtividadeForm'));
const AdminParticipantes = lazy(() => import('./pages/admin/AdminParticipantes'));
const AdminInscricoes = lazy(() => import('./pages/admin/AdminInscricoes'));
const AdminPresencas = lazy(() => import('./pages/admin/AdminPresencas'));
const AdminOperador = lazy(() => import('./pages/admin/AdminOperador'));
const AdminTelao = lazy(() => import('./pages/admin/AdminTelao'));
const AdminCertificados = lazy(() => import('./pages/admin/AdminCertificados'));
const AdminRelatorios = lazy(() => import('./pages/admin/AdminRelatorios'));
const AdminUsuarios = lazy(() => import('./pages/admin/AdminUsuarios'));
const AdminConfiguracoes = lazy(() => import('./pages/admin/AdminConfiguracoes'));
const AdminSorteios = lazy(() => import('./pages/admin/AdminSorteios'));
const AdminPagamentos = lazy(() => import('./pages/admin/AdminPagamentos'));
const AdminPix = lazy(() => import('./pages/admin/AdminPix'));
const AdminProdutos = lazy(() => import('./pages/admin/AdminProdutos'));
const AdminCupons = lazy(() => import('./pages/admin/AdminCupons'));
const AdminPedidos = lazy(() => import('./pages/admin/AdminPedidos'));
const AdminComunicacao = lazy(() => import('./pages/admin/AdminComunicacao'));

const Loja = lazy(() => import('./pages/Loja'));
const Cupons = lazy(() => import('./pages/Cupons'));
const MeusPedidos = lazy(() => import('./pages/MeusPedidos'));
const MeusPagamentos = lazy(() => import('./pages/MeusPagamentos'));
const Comunicacao = lazy(() => import('./pages/Comunicacao'));

function PageLoader() {
  return <div className="route-loading"><Spinner text="Carregando..." /></div>;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/eventos" element={<Events />} />
          <Route path="/eventos/:idOrSlug" element={<EventDetail />} />
          <Route path="/validar-certificado" element={<ValidateCertificate />} />
          <Route path="/como-funciona" element={<StaticPage page="como-funciona" />} />
          <Route path="/sobre" element={<StaticPage page="sobre" />} />
          <Route path="/contato" element={<StaticPage page="contato" />} />
          <Route path="/privacidade" element={<StaticPage page="privacidade" />} />
          <Route path="/termos" element={<StaticPage page="termos" />} />
        </Route>

        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route path="/recuperar-senha/token" element={<ResetPassword />} />

        {/* Participant area */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/minha-area" element={<MinhaArea />} />
            <Route path="/minhas-inscricoes" element={<MinhasInscricoes />} />
            <Route path="/inscricao/:id" element={<InscricaoDetail />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/certificados" element={<Certificados />} />
            <Route path="/certificados/:id" element={<CertificadoDetail />} />
            <Route path="/loja" element={<Loja />} />
            <Route path="/cupons" element={<Cupons />} />
            <Route path="/meus-pedidos" element={<MeusPedidos />} />
            <Route path="/meus-pagamentos" element={<MeusPagamentos />} />
            <Route path="/comunicacao" element={<Comunicacao />} />
          </Route>
        </Route>

        {/* Admin */}
        <Route element={<ProtectedRoute roles={['ADMIN', 'ORGANIZER']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/eventos" element={<AdminEventos />} />
            <Route path="/admin/eventos/novo" element={<AdminEventoForm />} />
            <Route path="/admin/eventos/:id" element={<AdminEventoForm />} />
            <Route path="/admin/atividades" element={<AdminAtividades />} />
            <Route path="/admin/atividades/novo" element={<AdminAtividadeForm />} />
            <Route path="/admin/atividades/:id" element={<AdminAtividadeForm />} />
            <Route path="/admin/participantes" element={<AdminParticipantes />} />
            <Route path="/admin/inscricoes" element={<AdminInscricoes />} />
            <Route path="/admin/presencas" element={<AdminPresencas />} />
            <Route path="/admin/presencas/:activityId" element={<AdminPresencas />} />
            <Route path="/admin/operador" element={<AdminOperador />} />
            <Route path="/admin/telao" element={<AdminTelao />} />
            <Route path="/admin/certificados" element={<AdminCertificados />} />
            <Route path="/admin/sorteios" element={<AdminSorteios />} />
            <Route path="/admin/pagamentos" element={<AdminPagamentos />} />
            <Route path="/admin/pix" element={<AdminPix />} />
            <Route path="/admin/produtos" element={<AdminProdutos />} />
            <Route path="/admin/cupons" element={<AdminCupons />} />
            <Route path="/admin/pedidos" element={<AdminPedidos />} />
            <Route path="/admin/comunicacao" element={<AdminComunicacao />} />
            <Route path="/admin/relatorios" element={<AdminRelatorios />} />
            <Route path="/admin/usuarios" element={<AdminUsuarios />} />
            <Route path="/admin/configuracoes" element={<AdminConfiguracoes />} />
          </Route>
        </Route>

        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  );
}
