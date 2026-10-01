import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { applyBrandColors, isDemoContent, mergeContent, type SiteContent } from '@/lib/content';
import type { PublicWorkingHours } from '@/lib/types';
import { useAuth } from './useAuth';

interface SiteContentState {
  content: SiteContent;
  /** Conteúdo ainda não cadastrado: exibindo textos de demonstração. */
  isDemo: boolean;
  /** Administradora visualizando o rascunho antes de publicar. */
  preview: boolean;
  autoApprove: boolean;
  maxAdvanceDays: number;
  workingHours: PublicWorkingHours[];
  loading: boolean;
  error: unknown;
}

const PREVIEW_KEY = 'lash-preview';

export function isPreviewRequested(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '1') sessionStorage.setItem(PREVIEW_KEY, '1');
    return sessionStorage.getItem(PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export function exitPreview() {
  try {
    sessionStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* sem armazenamento: nada a limpar */
  }
}

interface PublicPayload {
  content: unknown;
  auto_approve: boolean;
  max_advance_days: number;
  working_hours: PublicWorkingHours[];
}

const Ctx = createContext<SiteContentState | null>(null);

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const preview = isAdmin && isPreviewRequested();

  const published = useQuery({
    queryKey: ['site-content'],
    enabled: !!supabase,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_site_content');
      if (error) throw error;
      return data as PublicPayload;
    },
  });

  const draft = useQuery({
    queryKey: ['site-content-draft'],
    enabled: !!supabase && preview,
    queryFn: async () => {
      const { data, error } = await supabase!.from('site_content').select('draft').eq('id', 1).single();
      if (error) throw error;
      return data.draft as unknown;
    },
  });

  const raw = preview ? draft.data : published.data?.content;

  const value = useMemo<SiteContentState>(
    () => ({
      content: mergeContent(raw),
      isDemo: isDemoContent(raw),
      preview,
      autoApprove: published.data?.auto_approve ?? false,
      maxAdvanceDays: published.data?.max_advance_days ?? 60,
      workingHours: published.data?.working_hours ?? [],
      loading: !!supabase && (published.isLoading || (preview && draft.isLoading)),
      error: published.error,
    }),
    [raw, preview, published.data, published.isLoading, published.error, draft.isLoading],
  );

  useEffect(() => {
    applyBrandColors(value.content.colors);
  }, [value.content.colors]);

  useEffect(() => {
    if (!value.loading) document.title = value.content.studioName;
  }, [value.loading, value.content.studioName]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteContent(): SiteContentState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSiteContent fora do provider');
  return ctx;
}
