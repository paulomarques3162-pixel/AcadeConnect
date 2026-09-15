import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, CalendarDays, Ticket, ScanLine, Award, Users, ArrowRight } from 'lucide-react';
import { eventApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { EventCard } from '../components/Cards';
import { Spinner, ErrorState } from '../components/ui';

const FEATURES = [
  { icon: <CalendarDays size={26} />, title: 'Descubra eventos', text: 'Encontre palestras, minicursos, workshops e muito mais em um só lugar.' },
  { icon: <Ticket size={26} />, title: 'Inscreva-se em segundos', text: 'Escolha suas atividades, receba sua inscrição e um QR Code único.' },
  { icon: <ScanLine size={26} />, title: 'Presença via QR Code', text: 'Apresente seu QR Code e tenha a presença registrada na hora.' },
  { icon: <Award size={26} />, title: 'Certificados automáticos', text: 'Cumpra os requisitos e receba seu certificado com código de validação.' },
];

export default function Home() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => eventApi.list({ limit: 3, status: 'OPEN' }).then((r) => r.data.events), []);

  const handleSearch = (e) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q');
    navigate(q ? `/eventos?search=${encodeURIComponent(q)}` : '/eventos');
  };

  const heroEvents = useMemo(() => data || [], [data]);

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <span className="hero__badge"><Users size={16} /> Plataforma da Mustangs Atlética</span>
          <h1>Viva a energia da atlética</h1>
          <p>Encontre eventos, competições e atividades da Mustangs e acompanhe sua jornada em um só lugar.</p>
          <div className="hero__actions">
            <Link className="btn btn--light btn--lg" to="/eventos">Explorar eventos</Link>
            <Link className="btn btn--outline btn--lg" style={{ borderColor: '#fff', color: '#fff' }} to="/minhas-inscricoes">Minhas inscrições</Link>
          </div>
          <form className="hero__search" onSubmit={handleSearch} role="search">
            <input name="q" placeholder="Pesquise eventos, palestras, cursos..." aria-label="Pesquisar" />
            <button type="submit" className="hero__search-icon" aria-label="Buscar" style={{ background: 'none', border: 'none' }}>
              <Search size={22} />
            </button>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__head">
            <span className="section__sub">Como funciona</span>
            <h2>Uma jornada simples, do evento ao certificado</h2>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <div className="feature__icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--alt">
        <div className="container">
          <div className="section__head">
            <span className="section__sub">Eventos em destaque</span>
            <h2>Próximos eventos</h2>
          </div>
          {loading && <Spinner text="Carregando eventos..." />}
          {error && <ErrorState title="Não foi possível carregar os eventos." description="Tente novamente em instantes." onRetry={reload} />}
          {!loading && !error && (
            <>
              <div className="grid">
                {heroEvents.map((e) => <EventCard key={e.id} event={e} />)}
              </div>
              <div className="text-center mt-3">
                <Link className="btn btn--primary" to="/eventos">Ver todos os eventos <ArrowRight size={18} /></Link>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
