import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Database, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback';
import { Button, ButtonLink } from '@/components/ui/Button';
import { AdminLayout } from './AdminLayout';
import { AdminActionsProvider } from './AdminActions';
import LoginPage from './auth/LoginPage';
import ForgotPasswordPage from './auth/ForgotPasswordPage';
import ResetPasswordPage from './auth/ResetPasswordPage';
import '@/styles/admin.css';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));
const RemindersPage = lazy(() => import('./pages/RemindersPage'));
const ServicesAdminPage = lazy(() => import('./pages/ServicesAdminPage'));
const GalleryAdminPage = lazy(() => import('./pages/GalleryAdminPage'));
const ContentPage = lazy(() => import('./pages/ContentPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const DailyReportPage = lazy(() => import('./pages/DailyReportPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="card auth-card" style={{ maxWidth: 520 }}>{children}</div>
    </div>
  );
}

/** Protege o painel: só entra quem está logada E cadastrada como administradora. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, isAdmin, loading, recovering, signOut } = useAuth();
  const location = useLocation();

  if (!isSupabaseConfigured) {
    return (
      <Centered>
        <EmptyState
          icon={Database}
          title="Conecte o Supabase"
          text="O painel precisa do banco de dados. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local (ou nas variáveis da Vercel) seguindo o README."
          action={<ButtonLink to="/" variant="secondary">Ver o site</ButtonLink>}
        />
      </Centered>
    );
  }
  if (loading) return <LoadingBlock text="Verificando acesso…" />;
  if (recovering) return <Navigate to="/admin/nova-senha" replace />;
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  if (!isAdmin) {
    return (
      <Centered>
        <EmptyState
          icon={ShieldAlert}
          title="Acesso não autorizado"
          text={
            <>
              A conta <strong>{session.user.email}</strong> não tem permissão para acessar o painel. Somente
              administradoras cadastradas pelo responsável do sistema podem entrar.
            </>
          }
          action={
            <Button variant="secondary" icon={<LogOut />} onClick={signOut}>
              Sair desta conta
            </Button>
          }
        />
      </Centered>
    );
  }
  return <>{children}</>;
}

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="recuperar-senha" element={<ForgotPasswordPage />} />
      <Route path="nova-senha" element={<ResetPasswordPage />} />
      <Route
        element={
          <RequireAdmin>
            <AdminActionsProvider>
              <AdminLayout />
            </AdminActionsProvider>
          </RequireAdmin>
        }
      >
        <Route index element={<Lazy><DashboardPage /></Lazy>} />
        <Route path="agenda" element={<Lazy><AgendaPage /></Lazy>} />
        <Route path="clientes" element={<Lazy><ClientsPage /></Lazy>} />
        <Route path="clientes/:id" element={<Lazy><ClientDetailPage /></Lazy>} />
        <Route path="lembretes" element={<Lazy><RemindersPage /></Lazy>} />
        <Route path="ata" element={<Lazy><DailyReportPage /></Lazy>} />
        <Route path="financeiro" element={<Lazy><FinancePage /></Lazy>} />
        <Route path="servicos" element={<Lazy><ServicesAdminPage /></Lazy>} />
        <Route path="galeria" element={<Lazy><GalleryAdminPage /></Lazy>} />
        <Route path="conteudo" element={<Lazy><ContentPage /></Lazy>} />
        <Route path="configuracoes" element={<Lazy><SettingsPage /></Lazy>} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingBlock />}>{children}</Suspense>;
}
