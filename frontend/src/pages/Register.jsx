import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../api/client';

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', course: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 3) errs.name = 'Informe seu nome completo.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'E-mail inválido.';
    if (form.password.length < 8) errs.password = 'A senha deve ter pelo menos 8 caracteres.';
    if (form.password !== form.confirm) errs.confirm = 'As senhas não conferem.';
    if (!form.course.trim()) errs.course = 'Informe seu curso.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const res = await register({ name: form.name, email: form.email, password: form.password, course: form.course });
      toast.success('Conta criada com sucesso!');
      navigate(res.data.user.role === 'ORGANIZER' ? '/admin' : '/minha-area', { replace: true });
    } catch (err) {
      setErrors({ form: getErrorMessage(err, 'Não foi possível criar a conta.') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__side">
        <Logo light />
        <div style={{ marginTop: 'auto' }}>
          <h1>Comece sua jornada</h1>
          <p>Crie sua conta e tenha acesso a eventos, inscrições, presenças e certificados.</p>
        </div>
      </div>
      <div className="auth__form">
        <div className="auth__card">
          <h2>Criar conta</h2>
          <p>É rápido e gratuito.</p>
          <form onSubmit={submit}>
            {errors.form && <div className="field__error mb-2">{errors.form}</div>}
            <Field label="Nome completo" required error={errors.name}>
              <Input value={form.name} onChange={set('name')} placeholder="Seu nome" required autoComplete="name" />
            </Field>
            <Field label="E-mail" required error={errors.email}>
              <Input type="email" value={form.email} onChange={set('email')} placeholder="voce@email.com" required autoComplete="email" />
            </Field>
            <Field label="Curso" required error={errors.course}>
              <Input value={form.course} onChange={set('course')} placeholder="Ex.: Medicina Veterinária" required />
            </Field>
            <Field label="Senha" required error={errors.password} hint="Mínimo de 8 caracteres.">
              <Input type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" />
            </Field>
            <Field label="Confirmar senha" required error={errors.confirm}>
              <Input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
            </Field>
            <p className="text-muted" style={{ fontSize: '0.78rem', margin: 0 }}>
              Ao criar sua conta você concorda com os <Link to="/termos">Termos de Uso</Link> e a <Link to="/privacidade">Política de Privacidade</Link>.
            </p>
            <Button type="submit" className="btn--block" loading={loading}>Criar conta</Button>
          </form>
          <p className="auth__alt">Já tem conta? <Link to="/login"><strong>Entrar</strong></Link></p>
        </div>
      </div>
    </div>
  );
}
