import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Link2Off } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSiteContent } from '@/hooks/useSiteContent';
import { friendlyError } from '@/lib/errors';
import { Logo } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Callout, EmptyState, LoadingBlock } from '@/components/ui/Feedback';
import { TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export default function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const { content } = useSiteContent();
  const toast = useToast();
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (pwd !== pwd2) return setError('As senhas não conferem.');
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) return setError(friendlyError(error, 'Não foi possível salvar a nova senha.'));
    toast.success('Senha alterada com sucesso.');
    // Recarrega para sair do modo de recuperação já com a sessão atualizada.
    window.setTimeout(() => window.location.replace('/admin'), 600);
  }

  if (loading) return <LoadingBlock text="Validando link…" />;

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <Logo name={content.studioName} logoUrl={content.logo} />
        {!session ? (
          <EmptyState
            icon={Link2Off}
            title="Link inválido ou expirado"
            text="Solicite um novo link de recuperação de senha."
            action={<Link to="/admin/recuperar-senha" className="btn btn-primary">Pedir novo link</Link>}
          />
        ) : (
          <>
            <h1>Nova senha</h1>
            <p>Crie uma senha com pelo menos 8 caracteres.</p>
            <div className="stack">
              {error && <Callout tone="danger">{error}</Callout>}
              <TextInput label="Nova senha" type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
              <TextInput label="Repita a nova senha" type="password" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
              <Button type="submit" size="lg" block loading={busy} icon={<KeyRound />}>
                Salvar nova senha
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
