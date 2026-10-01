import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MailCheck, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSiteContent } from '@/hooks/useSiteContent';
import { friendlyError } from '@/lib/errors';
import { isValidEmail } from '@/lib/format';
import { Logo } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Callout, EmptyState } from '@/components/ui/Feedback';

export default function ForgotPasswordPage() {
  const { content } = useSiteContent();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) return setError('Informe um e-mail válido.');
    if (!supabase) return setError('O Supabase ainda não foi configurado.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/nova-senha`,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error, 'Não foi possível enviar o e-mail agora.'));
    // Mesmo aviso exista ou não a conta, para não revelar e-mails cadastrados.
    setSent(true);
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <Logo name={content.studioName} logoUrl={content.logo} />
        {sent ? (
          <EmptyState
            icon={MailCheck}
            title="Confira seu e-mail"
            text="Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Verifique também a caixa de spam."
          />
        ) : (
          <>
            <h1>Recuperar senha</h1>
            <p>Informe seu e-mail e enviaremos um link para você criar uma nova senha.</p>
            <div className="stack">
              {error && <Callout tone="danger">{error}</Callout>}
              <div className="field">
                <label className="field-label" htmlFor="email">E-mail</label>
                <div className="input-group">
                  <Mail aria-hidden />
                  <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <Button type="submit" size="lg" block loading={busy} icon={<Send />}>
                Enviar link
              </Button>
            </div>
          </>
        )}
        <div className="auth-foot">
          <Link to="/admin/login" className="link">Voltar para o login</Link>
        </div>
      </form>
    </div>
  );
}
