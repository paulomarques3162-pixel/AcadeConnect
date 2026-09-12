import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Logo light />
          <p>Viva a energia da atlética.<br />A plataforma da Mustangs que acompanha sua jornada nos eventos.</p>
        </div>
        <div className="footer__col">
          <h4>Plataforma</h4>
          <Link to="/eventos">Eventos</Link>
          <Link to="/como-funciona">Como funciona</Link>
          <Link to="/sobre">Sobre</Link>
          <Link to="/validar-certificado">Validar certificado</Link>
        </div>
        <div className="footer__col">
          <h4>Acesso</h4>
          <Link to="/login">Entrar</Link>
          <Link to="/cadastro">Criar conta</Link>
          <Link to="/minha-area">Minha área</Link>
          <Link to="/certificados">Certificados</Link>
        </div>
        <div className="footer__col">
          <h4>Legal</h4>
          <Link to="/privacidade">Política de Privacidade</Link>
          <Link to="/termos">Termos de Uso</Link>
          <Link to="/contato">Contato</Link>
        </div>
      </div>
      <div className="footer__bottom container">
        <span>© {new Date().getFullYear()} Mustangs Atlética Anhanguera. Todos os direitos reservados.</span>
        <span>Esporte · Competição · Comunidade</span>
      </div>
    </footer>
  );
}
