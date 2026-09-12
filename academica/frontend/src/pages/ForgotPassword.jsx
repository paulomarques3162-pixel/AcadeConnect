import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button, Field, Input } from '../components/ui';
import { authApi } from '../api/services';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../api/client';

export default function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [resetUrl, setResetUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.forgot(email);
      setSent(true);
      if (res.data?.resetUrl) setResetUrl(res.data.resetUrl);
      toast.info('Se o e-mail existir, enviaremos um link de recuperação.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__side"><Logo light /><div style={{ marginTop: 'auto' }}><h1>Recuperar senha</h1><p>Vamos te ajudar a recuperar o acesso à sua conta.</p></div></div>
      <div className="auth__form">
        <div className="auth__card">
          <h2>Recuperar senha</h2>
          {sent ? (
            <div>
              <p className="text-muted mb-3">Se o e-mail existir, você receberá um link para redefinir sua senha.</p>
              {resetUrl && (
                <div className="card card-pad mb-2">
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>Ambiente de desenvolvimento (SMTP desativado):</p>
                  <a href={`/recuperar-senha/token?token=${new URLSearchParams(resetUrl.split('?')[1]).get('token')}`} style={{ fontSize: '0.85rem' }}>Clique aqui para redefinir</a>
                </div>
              )}
              <Link className="btn btn--secondary btn--block" to="/login">Voltar para o login</Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <Field label="E-mail" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@email.com" />
              </Field>
              <Button type="submit" className="btn--block" loading={loading}>Enviar link</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
