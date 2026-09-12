import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../api/client';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: 'participante@demo.com', password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(form.email, form.password);
      toast.success('Login realizado com sucesso!');
      const from = location.state?.from || (res.data.user.role === 'ADMIN' || res.data.user.role === 'ORGANIZER' ? '/admin' : '/minha-area');
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível entrar.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__side">
        <Logo light />
        <div style={{ marginTop: 'auto' }}>
          <h1>Bem-vindo de volta</h1>
          <p>Continue acompanhando seus eventos, presenças e certificados em um só lugar.</p>
        </div>
      </div>
      <div className="auth__form">
        <div className="auth__card">
          <h2>Entrar</h2>
          <p>Use sua conta para acessar sua área.</p>
          <form onSubmit={submit}>
            <Field label="E-mail" required>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" />
            </Field>
            <Field label="Senha" required>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="current-password" />
            </Field>
            <div className="flex-between">
              <Link to="/recuperar-senha" style={{ fontSize: '0.85rem' }}>Esqueci minha senha</Link>
            </div>
            <Button type="submit" className="btn--block" loading={loading}>Entrar</Button>
          </form>
          <p className="auth__alt">Não tem conta? <Link to="/cadastro"><strong>Criar conta</strong></Link></p>
        </div>
      </div>
    </div>
  );
}
