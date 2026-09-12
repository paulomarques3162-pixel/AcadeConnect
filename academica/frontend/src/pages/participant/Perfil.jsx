import { useRef, useState } from 'react';
import { Camera, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { userApi, authApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button, Field, Input, Spinner, ErrorState, Card } from '../../components/ui';
import { ConfirmDialog } from '../../components/Overlay';
import { fullNameInitials } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

export default function Perfil() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const { data, loading, error, reload } = useApi(() => userApi.profile().then((r) => r.data.user), []);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await userApi.updateProfile(form);
      updateUser(res.data.user);
      toast.success('Perfil atualizado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file) => {
    try {
      const res = await userApi.updateAvatar(file);
      updateUser(res.data.user);
      toast.success('Foto atualizada.');
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    try {
      await authApi.changePassword({ currentPassword: pw.current, newPassword: pw.next });
      toast.success('Senha alterada.');
      setPw({ current: '', next: '' });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const deleteAccount = async () => {
    try {
      await userApi.deleteAccount();
      toast.info('Conta excluída.');
      await logout();
      navigate('/');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (loading) return <Spinner text="Carregando perfil..." />;
  if (error) return <ErrorState onRetry={reload} />;
  const profile = data || {};

  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Meu perfil</h1>
      <p className="text-muted mb-3">Gerencie seus dados pessoais.</p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <Card className="card-pad">
          <div className="flex mb-3" style={{ gap: 16 }}>
            <button className="avatar" style={{ width: 72, height: 72, fontSize: '1.6rem' }} onClick={() => fileRef.current?.click()} title="Alterar foto">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.name} /> : fullNameInitials(profile.name)}
            </button>
            <div>
              <h3>{profile.name}</h3>
              <p className="text-muted" style={{ margin: 0 }}>{profile.email} · {profile.course || 'Sem curso'}</p>
              <button className="btn btn--sm btn--secondary mt-1" onClick={() => fileRef.current?.click()}>
                <Camera size={15} /> Alterar foto
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
            </div>
          </div>

          <form onSubmit={saveProfile} className="form-grid">
            <Field label="Nome"><Input value={form.name ?? profile.name} onChange={set('name')} /></Field>
            <Field label="Telefone"><Input value={form.phone ?? profile.phone ?? ''} onChange={set('phone')} placeholder="(00) 00000-0000" /></Field>
            <Field label="Curso"><Input value={form.course ?? profile.course ?? ''} onChange={set('course')} /></Field>
            <Field label="Cidade"><Input value={form.city ?? profile.city ?? ''} onChange={set('city')} /></Field>
            <Field label="Estado (UF)"><Input value={form.state ?? profile.state ?? ''} onChange={set('state')} maxLength={2} /></Field>
            <div className="flex" style={{ alignItems: 'flex-end' }}>
              <Button type="submit" loading={saving}>Salvar alterações</Button>
            </div>
          </form>
        </Card>

        <div className="list">
          <Card className="card-pad">
            <h3 className="mb-2">Alterar senha</h3>
            <form onSubmit={changePw} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Senha atual"><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
              <Field label="Nova senha" hint="Mínimo de 8 caracteres."><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
              <Button type="submit">Alterar senha</Button>
            </form>
          </Card>

          <Card className="card-pad" style={{ borderColor: 'var(--danger)' }}>
            <div className="flex mb-2" style={{ color: 'var(--danger)' }}><ShieldAlert size={20} /><strong>Zona de risco</strong></div>
            <p className="text-muted" style={{ fontSize: '0.88rem' }}>A exclusão da conta remove permanentemente seu acesso e anonimiza seus dados pessoais (LGPD).</p>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>Excluir minha conta</Button>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Excluir conta"
        message="Tem certeza? Seus dados pessoais serão anonimizados e você perderá o acesso à sua conta."
        confirmLabel="Excluir conta"
        danger
        onConfirm={deleteAccount}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}
