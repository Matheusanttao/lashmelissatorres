import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Lock, Mail, LogIn } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSiteContent } from '@/hooks/useSiteContent';
import { friendlyError } from '@/lib/errors';
import { Logo } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';

export default function LoginPage() {
  const { session, isAdmin, loading, signOut } = useAuth();
  const { content } = useSiteContent();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  // Depois do login, aguarda a verificação de administradora. Contas sem
  // permissão são desconectadas na hora, com aviso claro.
  useEffect(() => {
    if (!waiting || loading || !session) return;
    setWaiting(false);
    setBusy(false);
    if (!isAdmin) {
      signOut();
      setError('Esta conta não tem permissão para acessar o painel. Fale com a responsável pelo sistema.');
    }
  }, [waiting, loading, session, isAdmin, signOut]);

  if (!loading && session && isAdmin) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return setError('O Supabase ainda não foi configurado.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      return setError(friendlyError(error, 'Não foi possível entrar. Tente novamente.'));
    }
    setWaiting(true);
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <Logo name={content.studioName} logoUrl={content.logo} />
        <h1>Área da profissional</h1>
        <p>Entre para acessar sua agenda e o painel do estúdio.</p>
        <div className="stack">
          {error && <Callout tone="danger">{error}</Callout>}
          <div className="field">
            <label className="field-label" htmlFor="email">E-mail</label>
            <div className="input-group">
              <Mail aria-hidden />
              <input id="email" className="input" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">Senha</label>
            <div className="input-group">
              <Lock aria-hidden />
              <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <Button type="submit" size="lg" block loading={busy} icon={<LogIn />} disabled={!email || !password}>
            Entrar
          </Button>
        </div>
        <div className="auth-foot">
          <Link to="/admin/recuperar-senha" className="link">Esqueci minha senha</Link>
          <div style={{ marginTop: 14 }}>
            <Link to="/" className="small muted">← Voltar para o site</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
