import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarHeart, ChevronRight, Eye, Info, Menu, MessageCircle, X } from 'lucide-react';
import { useSiteContent, exitPreview } from '@/hooks/useSiteContent';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { instagramHandle, instagramUrl } from '@/lib/content';
import { whatsappLink } from '@/lib/whatsapp';
import { formatPhone } from '@/lib/format';
import { InstagramIcon as Instagram, Logo } from '@/components/ui/Brand';
import { ButtonAnchor, ButtonLink, IconButton } from '@/components/ui/Button';

const NAV = [
  { to: '/', label: 'Início', end: true },
  { to: '/servicos', label: 'Serviços e preços' },
  { to: '/galeria', label: 'Galeria' },
  { to: '/cuidados', label: 'Cuidados' },
];

export const WHATSAPP_GREETING = 'Olá! Vim pelo site e gostaria de agendar um horário.';

function DemoBar() {
  const { isDemo } = useSiteContent();
  const { isAdmin } = useAuth();
  if (!isSupabaseConfigured) {
    return (
      <div className="demo-bar" role="note">
        <Info aria-hidden />
        <span>
          <strong>Modo demonstração:</strong> o banco de dados ainda não foi conectado. Textos e imagens são de
          exemplo.
        </span>
      </div>
    );
  }
  if (!isDemo) return null;
  return (
    <div className="demo-bar" role="note">
      <Info aria-hidden />
      <span>
        <strong>Conteúdo de demonstração.</strong> Nome, textos e contatos são exemplos e serão substituídos quando o
        estúdio publicar suas informações.
      </span>
      {isAdmin && <Link to="/admin/conteudo" className="link">Editar agora</Link>}
    </div>
  );
}

function PreviewBar() {
  const { preview } = useSiteContent();
  if (!preview) return null;
  return (
    <div className="preview-bar" role="note">
      <Eye aria-hidden />
      <span>Pré-visualização do rascunho — visitantes ainda veem a versão publicada.</span>
      <Link to="/admin/conteudo">Voltar ao painel</Link>
      <button
        type="button"
        onClick={() => {
          exitPreview();
          window.location.href = window.location.pathname;
        }}
      >
        Sair da pré-visualização
      </button>
    </div>
  );
}

function Header() {
  const { content } = useSiteContent();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="container">
        <Link to="/" aria-label={`${content.studioName} — início`}>
          <Logo name={content.studioName} logoUrl={content.logo} />
        </Link>
        <nav className="nav-links" aria-label="Principal">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          {content.contact.whatsapp && (
            <ButtonAnchor
              variant="ghost"
              className="hide-mobile"
              href={whatsappLink(content.contact.whatsapp, WHATSAPP_GREETING)}
              target="_blank"
              rel="noopener noreferrer"
              icon={<MessageCircle />}
            >
              WhatsApp
            </ButtonAnchor>
          )}
          <ButtonLink to="/agendar" className="hide-mobile" icon={<CalendarHeart />}>
            Agendar
          </ButtonLink>
          <IconButton label="Abrir menu" className="menu-toggle" onClick={() => setOpen(true)}>
            <Menu />
          </IconButton>
        </div>
      </div>

      {open && (
        <div className="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="mobile-menu-head">
            <Logo name={content.studioName} logoUrl={content.logo} />
            <IconButton label="Fechar menu" onClick={() => setOpen(false)}>
              <X />
            </IconButton>
          </div>
          <nav aria-label="Menu principal">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
                <ChevronRight aria-hidden />
              </NavLink>
            ))}
          </nav>
          <div className="mobile-menu-foot">
            <ButtonLink to="/agendar" size="lg" block icon={<CalendarHeart />}>
              Agendar meu horário
            </ButtonLink>
            {content.contact.whatsapp && (
              <ButtonAnchor
                variant="secondary"
                size="lg"
                block
                href={whatsappLink(content.contact.whatsapp, WHATSAPP_GREETING)}
                target="_blank"
                rel="noopener noreferrer"
                icon={<MessageCircle />}
              >
                Falar no WhatsApp
              </ButtonAnchor>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const { content } = useSiteContent();
  const c = content.contact;
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="stack" style={{ '--gap': '14px' } as React.CSSProperties}>
            <Logo name={content.studioName} logoUrl={content.logo} />
            <p className="muted small" style={{ maxWidth: 340 }}>
              {content.tagline}
            </p>
          </div>
          <div>
            <h4>Navegue</h4>
            <ul>
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to}>{n.label}</Link>
                </li>
              ))}
              <li>
                <Link to="/agendar">Agendar horário</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Contato</h4>
            <ul>
              {c.whatsapp && (
                <li>
                  <a href={whatsappLink(c.whatsapp, WHATSAPP_GREETING)} target="_blank" rel="noopener noreferrer">
                    WhatsApp {formatPhone(c.whatsapp)}
                  </a>
                </li>
              )}
              {c.instagram && (
                <li>
                  <a href={instagramUrl(c.instagram)} target="_blank" rel="noopener noreferrer">
                    <Instagram size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                    {instagramHandle(c.instagram)}
                  </a>
                </li>
              )}
              {c.email && (
                <li>
                  <a href={`mailto:${c.email}`}>{c.email}</a>
                </li>
              )}
              {c.address && <li className="muted small">{c.address}{c.city ? ` · ${c.city}` : ''}</li>}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {content.studioName}. Feito com carinho.
          </span>
          <Link to="/admin">Área da profissional</Link>
        </div>
      </div>
    </footer>
  );
}

function MobileCta() {
  const { content } = useSiteContent();
  const { pathname } = useLocation();
  if (pathname.startsWith('/agendar') || pathname.startsWith('/agendamento')) return null;
  return (
    <div className="mobile-cta">
      <ButtonLink to="/agendar" icon={<CalendarHeart />}>
        Agendar meu horário
      </ButtonLink>
      {content.contact.whatsapp && (
        <ButtonAnchor
          variant="whatsapp"
          href={whatsappLink(content.contact.whatsapp, WHATSAPP_GREETING)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
        >
          <MessageCircle />
        </ButtonAnchor>
      )}
    </div>
  );
}

export function PublicLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PreviewBar />
      <DemoBar />
      <Header />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
      <MobileCta />
    </div>
  );
}
