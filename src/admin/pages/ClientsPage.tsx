import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Globe, Search, UserPlus, Users, X } from 'lucide-react';
import { formatPhone, initials } from '@/lib/format';
import { useClients } from '../api';
import { useAdminActions } from '../AdminActions';
import { PageHeader } from '../AdminLayout';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { useNavigate } from 'react-router-dom';

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const q = useClients(debounced);
  const actions = useAdminActions();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Cadastros, histórico, preferências e autorizações de imagem."
        actions={
          <Button icon={<UserPlus />} onClick={() => actions.newClient((c) => navigate(`/admin/clientes/${c.id}`))}>
            Nova cliente
          </Button>
        }
      />
      <div className="search-bar">
        <div className="input-group">
          <Search aria-hidden />
          <input
            className="input"
            type="search"
            placeholder="Buscar por nome ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar clientes"
          />
          {search && (
            <span className="input-addon">
              <IconButton label="Limpar busca" size="sm" onClick={() => setSearch('')}><X /></IconButton>
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {q.isLoading ? (
          <div className="card-body stack">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={48} />)}</div>
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          debounced ? (
            <EmptyState icon={Search} title="Nenhuma cliente encontrada" text={`Não encontramos resultados para “${debounced}”.`} />
          ) : (
            <EmptyState
              icon={Users}
              title="Sua lista de clientes começa aqui"
              text="Clientes que agendam pelo site entram automaticamente. Você também pode cadastrar manualmente."
              action={<Button icon={<UserPlus />} onClick={() => actions.newClient()}>Cadastrar cliente</Button>}
            />
          )
        ) : (
          q.data.map((c) => (
            <Link key={c.id} to={`/admin/clientes/${c.id}`} className="client-row">
              <span className="avatar">{initials(c.name)}</span>
              <div className="grow">
                <strong style={{ display: 'block' }}>{c.name}</strong>
                <span className="meta">
                  {formatPhone(c.whatsapp)}
                  {c.email ? ` · ${c.email}` : ''}
                </span>
              </div>
              <div className="client-row-trail">
                {c.source === 'site' && <span className="badge badge-info" title="Primeiro contato pelo site"><Globe aria-hidden /> Site</span>}
                <ChevronRight size={18} color="var(--ink-3)" aria-hidden />
              </div>
            </Link>
          ))
        )}
      </div>
      {q.data && q.data.length >= 200 && <p className="small muted" style={{ marginTop: 10 }}>Mostrando as primeiras 200. Use a busca para encontrar outras.</p>}
    </>
  );
}
