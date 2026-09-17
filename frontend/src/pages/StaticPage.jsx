import { settingApi } from '../api/services';
import { useApi } from '../hooks/useApi';

const CONTENT = {
  'como-funciona': {
    title: 'Como funciona',
    body: `
      <h2>1. Crie sua conta</h2>
      <p>Cadastre-se gratuitamente com seu e-mail e curso. Você terá acesso à sua área pessoal.</p>
      <h2>2. Encontre um evento</h2>
      <p>Explore os eventos acadêmicos disponíveis, filtre por categoria, modalidade e data.</p>
      <h2>3. Inscreva-se</h2>
      <p>Escolha suas atividades favoritas (palestras, minicursos, workshops) e confirme sua inscrição. Você receberá um número de inscrição e um QR Code.</p>
      <h2>4. Compareça e registre presença</h2>
      <p>No dia, apresente seu QR Code na entrada de cada atividade. O organizador escaneia e sua presença é registrada automaticamente.</p>
      <h2>5. Receba seu certificado</h2>
      <p>Ao cumprir o percentual de presença exigido, seu certificado é emitido com um código único de validação.</p>
      <h2>6. Valide seu certificado</h2>
      <p>Qualquer pessoa pode verificar a autenticidade de um certificado usando o código na página de validação.</p>
    `,
  },
  'sobre': {
    title: 'Sobre a Mustangs Atlética',
    body: `
      <p>A Mustangs Atlética Anhanguera representa a força, a competição e a união do nosso time universitário. Esta plataforma reúne a gestão de eventos da atlética: das competições e torneios à emissão de certificados de participação.</p>
      <p>Inspirada nos valores de esporte, garra, conhecimento e comunidade, a plataforma foi construída com tecnologia moderna e foco total na experiência do usuário.</p>
      <h2>Para organizadores</h2>
      <p>Crie eventos, monte a programação, controle inscrições e presenças, emita certificados e acompanhe relatórios em tempo real.</p>
      <h2>Para atletas e participantes</h2>
      <p>Acompanhe seus eventos, use QR Code para registrar presença e baixe seus certificados com validação pública.</p>
    `,
  },
  'contato': {
    title: 'Contato',
    body: `
      <p>Dúvidas, sugestões ou suporte? Fale conosco.</p>
      <p>E-mail: <strong>contato@mustangsatletica.com</strong><br/>Telefone: (00) 0000-0000</p>
      <p>Nossa equipe responde em até 48 horas úteis.</p>
    `,
  },
  'privacidade': {
    title: 'Política de Privacidade',
    body: `
      <h2>1. Dados coletados</h2>
      <p>Coletamos apenas os dados necessários para o funcionamento da plataforma: nome, e-mail, curso e, opcionalmente, telefone, cidade e estado. Não coletamos dados sensíveis sem necessidade.</p>
      <h2>2. Uso dos dados</h2>
      <p>Seus dados são usados para autenticação, inscrição em eventos, registro de presença, emissão de certificados e comunicação sobre atividades.</p>
      <h2>3. Compartilhamento</h2>
      <p>Seus dados são compartilhados apenas com as instituições/organizadores dos eventos em que você se inscreve, para fins de gestão do evento.</p>
      <h2>4. Seus direitos (LGPD)</h2>
      <p>Você pode solicitar a exclusão da sua conta a qualquer momento, conforme a Lei Geral de Proteção de Dados (LGPD). Ao excluir, seus dados pessoais são anonimizados.</p>
      <h2>5. Segurança</h2>
      <p>Utilizamos criptografia de senhas, controle de acesso por papel e boas práticas de segurança para proteger seus dados.</p>
    `,
  },
  'termos': {
    title: 'Termos de Uso',
    body: `
      <h2>1. Aceitação</h2>
      <p>Ao criar uma conta, você concorda com estes termos de uso.</p>
      <h2>2. Responsabilidades do usuário</h2>
      <p>Você é responsável por manter suas credenciais em segurança e por usar a plataforma de forma ética e legal.</p>
      <h2>3. Inscrições e presença</h2>
      <p>Inscrições são pessoais e intransferíveis. A presença é registrada mediante validação de QR Code ou registro manual autorizado.</p>
      <h2>4. Certificados</h2>
      <p>Certificados são emitidos conforme critérios definidos por cada evento e possuem código único de validação pública.</p>
      <h2>5. Suspensão</h2>
      <p>O uso indevido pode levar à suspensão da conta.</p>
    `,
  },
};

// Escapa valores vindos do banco antes de injetá-los no HTML da página
// (os campos são administrativos, mas a defesa em profundidade é barata).
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function contactBody(contact = {}) {
  const lines = [];
  const push = (label, value, href) => {
    if (!value) return;
    const safe = escapeHtml(value);
    lines.push(`${label}: ${href ? `<a href="${escapeHtml(href)}">${safe}</a>` : `<strong>${safe}</strong>`}`);
  };
  push('E-mail', contact.email, contact.email ? `mailto:${contact.email}` : null);
  push('Telefone', contact.phone, contact.phone ? `tel:${contact.phone.replace(/[^+\d]/g, '')}` : null);
  push('WhatsApp', contact.whatsapp, contact.whatsapp ? `https://wa.me/${contact.whatsapp.replace(/[^\d]/g, '')}` : null);
  push('Endereço', contact.address);
  push('Atendimento', contact.hours);
  push('Instagram', contact.instagram, contact.instagram ? `https://instagram.com/${contact.instagram.replace(/^@/, '')}` : null);
  push('Facebook', contact.facebook, contact.facebook ? `https://facebook.com/${contact.facebook}` : null);
  push('YouTube', contact.youtube, contact.youtube ? `https://youtube.com/${contact.youtube}` : null);
  return `<p>Dúvidas, sugestões ou suporte? Fale conosco.</p><p>${lines.join('<br/>') || 'Informações de contato em atualização.'}</p><p>Nossa equipe responde em até 48 horas úteis.</p>`;
}

export default function StaticPage({ page }) {
  // A página de contato é alimentada pela configuração administrativa (com
  // cache curto no backend), permitindo alterar os dados sem tocar no código.
  const contactQuery = useApi(
    () => (page === 'contato' ? settingApi.contact().then((r) => r.data.contact) : Promise.resolve(null)),
    [page]
  );
  const base = CONTENT[page] || { title: 'Página', body: '<p>Conteúdo indisponível.</p>' };
  const content = page === 'contato' ? { title: base.title, body: contactBody(contactQuery.data || {}) } : base;

  return (
    <div className="container" style={{ maxWidth: 760, paddingTop: 48, paddingBottom: 48 }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 20 }}>{content.title}</h1>
      <div className="static-content" dangerouslySetInnerHTML={{ __html: content.body }} />
      <style>{`.static-content h2{font-size:1.25rem;margin:22px 0 8px;color:var(--brand)} .static-content p{color:var(--text-muted);line-height:1.7} .static-content a{color:var(--brand)}`}</style>
    </div>
  );
}
