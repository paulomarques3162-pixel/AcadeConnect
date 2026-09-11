import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button, Field, Input } from '../components/ui';
import { authApi } from '../api/services';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../api/client';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error('As senhas não conferem.');
    setLoading(true);
    try {
      await authApi.reset(token, form.password);
      toast.success('Senha redefinida com sucesso!');
      navigate('/login');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__side"><Logo light /><div style={{ marginTop: 'auto' }}><h1>Nova senha</h1><p>Defina uma nova senha para sua conta.</p></div></div>
      <div className="auth__form">
        <div className="auth__card">
          <h2>Definir nova senha</h2>
          <form onSubmit={submit}>
            <Field label="Nova senha" required hint="Mínimo de 8 caracteres.">
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </Field>
            <Field label="Confirmar nova senha" required>
              <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
            </Field>
            <Button type="submit" className="btn--block" loading={loading}>Redefinir senha</Button>
          </form>
          <p className="auth__alt"><Link to="/login">Voltar para o login</Link></p>
        </div>
      </div>
    </div>
  );
}
