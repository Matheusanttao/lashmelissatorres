import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell, CalendarDays, CalendarPlus, ExternalLink, FileText, Home, Images, LayoutGrid, Lock, LogOut, Menu, Palette, Plus,
  Settings, Sparkles, UserPlus, Users, BellPlus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSiteContent } from '@/hooks/useSiteContent';
import { Logo } from '@/components/ui/Brand';
import { IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { usePendingAppointments, useReminders } from './api';
import { useAdminActions } from './AdminActions';
import { todayKey } from '@/lib/format';

const MAIN = [
  { to: '/admin', label: 'Visão geral', icon: LayoutGrid, end: true },
  { to: '/admin/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/admin/ata', label: 'Ata do dia', icon: FileText },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/lembretes', label: 'Lembretes e tarefas', icon: Bell },
];
const SITE = [
  { to: '/admin/servicos', label: 'Serviços e preços', icon: Sparkles },
  { to: '/admin/galeria', label: 'Galeria', icon: Images },
  { to: '/admin/conteudo', label: 'Conteúdo do site', icon: Palette },
  { to: '/admin/configuracoes', label: 'Horários e agenda', icon: Settings },
];

function useBadges() {
  const pending = usePendingAppointments();
  const reminders = useReminders();
  const today = todayKey();
  const dueReminders = (reminders.data ?? []).filter((r) => !r.done && r.due_date <= today).length;
  return { pending: pending.data?.length ?? 0, reminders: dueReminders };
}

export function AdminLayout() {
  const { session, signOut } = useAuth();
  const { content } = useSiteContent();
  const actions = useAdminActions();
  const badges = useBadges();
  const location = useLocation();
  const [sheet, setSheet] = useState<'new' | 'more' | null>(null);

  useEffect(() => setSheet(null), [location.pathname]);
  useEffect(() => {
    document.title = `Painel · ${content.studioName}`;
  }, [content.studioName, location.pathname]);

  const quick = (fn: () => void) => () => {
    setSheet(null);
    fn();
  };

  return (
    <div className="admin">
      <aside className="sidebar" aria-label="Menu do painel">
        <Link to="/admin" className="sidebar-brand">
          <Logo name={content.studioName} logoUrl={content.logo} compact />
          <span style={{ minWidth: 0 }}>
            <span className="logo-name" style={{ display: 'block' }}>{content.studioName}</span>
            <small>Painel</small>
          </span>
        </Link>
        <nav>
          {MAIN.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="side-link">
              <n.icon aria-hidden />
              {n.label}
              {n.to === '/admin/agenda' && badges.pending > 0 && <span className="count" title="Solicitações pendentes">{badges.pending}</span>}
              {n.to === '/admin/lembretes' && badges.reminders > 0 && <span className="count" title="Lembretes para hoje ou vencidos">{badges.reminders}</span>}
            </NavLink>
          ))}
          <div className="sidebar-group">Site e configurações</div>
          {SITE.map((n) => (
            <NavLink key={n.to} to={n.to} className="side-link">
              <n.icon aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <a href="/" target="_blank" rel="noopener noreferrer" className="side-link">
            <ExternalLink aria-hidden /> Ver o site
          </a>
          <button type="button" className="side-link" style={{ border: 0, background: 'none', width: '100%' }} onClick={signOut}>
            <LogOut aria-hidden /> Sair
          </button>
          <div className="sidebar-user">
            <span title={session?.user.email}>{session?.user.email}</span>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <Link to="/admin">
            <Logo name={content.studioName} logoUrl={content.logo} />
          </Link>
          <IconButton label="Mais opções" onClick={() => setSheet('more')}>
            <Menu />
          </IconButton>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      {/* Navegação inferior no celular, ao alcance do polegar */}
      <nav className="bottom-nav" aria-label="Navegação do painel">
        <NavLink to="/admin" end>
          <Home aria-hidden /> Início
        </NavLink>
        <NavLink to="/admin/agenda">
          <CalendarDays aria-hidden /> Agenda
          {badges.pending > 0 && <span className="dot">{badges.pending}</span>}
        </NavLink>
        <button type="button" className="fab" aria-label="Criar novo" onClick={() => setSheet('new')}>
          <Plus aria-hidden />
        </button>
        <NavLink to="/admin/clientes">
          <Users aria-hidden /> Clientes
        </NavLink>
        <NavLink to="/admin/lembretes">
          <Bell aria-hidden /> Lembretes
          {badges.reminders > 0 && <span className="dot">{badges.reminders}</span>}
        </NavLink>
      </nav>

      <Modal open={sheet === 'new'} onClose={() => setSheet(null)} title="Criar" size="sm">
        <div className="action-grid">
          <button type="button" className="action-tile" onClick={quick(() => actions.newAppointment())}>
            <span className="icon-circle"><CalendarPlus aria-hidden /></span>
            <span>Novo agendamento<small>Marcar horário</small></span>
          </button>
          <button type="button" className="action-tile" onClick={quick(() => actions.newClient())}>
            <span className="icon-circle"><UserPlus aria-hidden /></span>
            <span>Nova cliente<small>Cadastro rápido</small></span>
          </button>
          <button type="button" className="action-tile" onClick={quick(() => actions.newBlock())}>
            <span className="icon-circle"><Lock aria-hidden /></span>
            <span>Bloquear horário<small>Ou registrar folga</small></span>
          </button>
          <button type="button" className="action-tile" onClick={quick(() => actions.newReminder())}>
            <span className="icon-circle"><BellPlus aria-hidden /></span>
            <span>Lembrete<small>Tarefa do dia</small></span>
          </button>
        </div>
      </Modal>

      <Modal open={sheet === 'more'} onClose={() => setSheet(null)} title="Menu" size="sm">
        <div className="more-list">
          {[...MAIN, ...SITE].map((n) => (
            <Link key={n.to} to={n.to}>
              <n.icon aria-hidden /> {n.label}
            </Link>
          ))}
          <a href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden /> Ver o site
          </a>
          <button type="button" onClick={signOut}>
            <LogOut aria-hidden /> Sair
          </button>
        </div>
      </Modal>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
