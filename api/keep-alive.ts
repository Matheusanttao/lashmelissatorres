import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Ping diário do banco (Vercel Cron).
 * Evita o projeto pausar no plano gratuito do Supabase por inatividade.
 *
 * Proteção: quando CRON_SECRET estiver definido na Vercel, só aceita
 * chamadas com Authorization: Bearer <CRON_SECRET> (o Cron envia isso sozinho).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('SEU-PROJETO')) {
    return res.status(500).json({ ok: false, error: 'Supabase não configurado' });
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Consulta leve e pública (anon já pode executar).
    const { error } = await supabase.rpc('get_site_content');
    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({
      ok: true,
      at: new Date().toISOString(),
      tz: 'UTC',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha no keep-alive';
    return res.status(500).json({ ok: false, error: message });
  }
}
