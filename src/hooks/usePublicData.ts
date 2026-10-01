import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DEMO_SERVICES } from '@/lib/content';
import type { GalleryCategory, PublicGalleryItem, Service } from '@/lib/types';

const SERVICE_COLUMNS =
  'id,name,description,type,duration_minutes,price_cents,price_is_from,image_url,image_path,active,featured,sort_order,maintenance_interval_days,maintenance_rules';

/** Serviços ativos (o banco só devolve ativos para visitantes). */
export function usePublicServices() {
  const q = useQuery({
    queryKey: ['public-services'],
    enabled: !!supabase,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('services')
        .select(SERVICE_COLUMNS)
        .eq('active', true)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as Service[];
    },
  });
  const real = q.data ?? [];
  const isDemo = !supabase || (q.isSuccess && real.length === 0);
  return {
    services: isDemo ? DEMO_SERVICES : real,
    isDemo,
    loading: !!supabase && q.isLoading,
    error: q.error,
    refetch: q.refetch,
  };
}

export function usePublicGallery() {
  return useQuery({
    queryKey: ['public-gallery'],
    enabled: !!supabase,
    staleTime: 30_000,
    queryFn: async () => {
      const [items, cats] = await Promise.all([
        supabase!.rpc('get_public_gallery'),
        supabase!.from('gallery_categories').select('id,name,description,sort_order').order('sort_order'),
      ]);
      if (items.error) throw items.error;
      if (cats.error) throw cats.error;
      return { items: items.data as PublicGalleryItem[], categories: cats.data as GalleryCategory[] };
    },
  });
}
