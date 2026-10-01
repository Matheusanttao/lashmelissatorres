import type { Service } from './types';

export interface FaqItem {
  q: string;
  a: string;
}

export interface SiteContent {
  studioName: string;
  tagline: string;
  heroText: string;
  heroImage: string | null;
  logo: string | null;
  colors: { accent: string; blush: string };
  about: { name: string; role: string; title: string; text: string; photo: string | null };
  space: { title: string; text: string; photos: string[] };
  contact: {
    whatsapp: string;
    phone: string;
    email: string;
    instagram: string;
    address: string;
    city: string;
    mapsUrl: string;
  };
  hoursNote: string;
  bookingNote: string;
  maintenanceRules: string;
  care: { before: string[]; after: string[] };
  faq: FaqItem[];
  policies: { late: string; cancellation: string; reschedule: string };
}

export const DEFAULT_ACCENT = '#9A5563';
export const DEFAULT_BLUSH = '#F2D9D5';

/**
 * Conteúdo de demonstração. Aparece somente enquanto a administradora
 * não publicar os textos reais pelo painel — e o site mostra um aviso.
 */
export const DEMO_CONTENT: SiteContent = {
  studioName: 'Studio Ana Lash',
  tagline: 'Um cuidado especial para realçar o seu olhar',
  heroText:
    'Extensão de cílios feita com calma, técnica e carinho — para você se sentir linda do jeito mais natural possível.',
  heroImage: null,
  logo: null,
  colors: { accent: DEFAULT_ACCENT, blush: DEFAULT_BLUSH },
  about: {
    name: 'Ana Souza',
    role: 'Lash designer',
    title: 'Prazer, eu sou a Ana',
    text:
      'Há mais de cinco anos transformo olhares com delicadeza. Cada atendimento começa com uma conversa: quero entender sua rotina, seu estilo e o que faz você se sentir bem. Trabalho com materiais hipoalergênicos, higienização rigorosa e muito cuidado com a saúde dos seus fios naturais.',
    photo: null,
  },
  space: {
    title: 'Um espaço pensado para você relaxar',
    text:
      'Maca confortável, luz suave, música tranquila e aquele cafezinho. Aqui o seu momento é tratado com a atenção que ele merece.',
    photos: [],
  },
  contact: {
    whatsapp: '11999999999',
    phone: '',
    email: 'contato@exemplo.com.br',
    instagram: 'studioanalash',
    address: 'Rua das Flores, 123 — Sala 4',
    city: 'São Paulo — SP',
    mapsUrl: '',
  },
  hoursNote: 'Atendimento somente com horário marcado.',
  bookingNote:
    'Chegue com os olhos limpos, sem maquiagem. O procedimento é feito deitada e de olhos fechados — muitas clientes até cochilam.',
  maintenanceRules:
    'A manutenção deve ser feita entre 15 e 21 dias após a aplicação. Depois de 25 dias, ou com menos de 40% dos fios, será necessária uma nova aplicação.',
  care: {
    before: [
      'Venha sem maquiagem nos olhos e sem rímel.',
      'Evite curvar os cílios ou usar cílios postiços no dia.',
      'Não use lentes de contato durante o procedimento.',
      'Se tiver alguma alergia ou sensibilidade, me conte antes.',
    ],
    after: [
      'Não molhe os cílios nas primeiras 24 horas.',
      'Evite sauna, vapor e piscina nas primeiras 48 horas.',
      'Escove os fios diariamente com a escovinha que você recebeu.',
      'Lave com espuma própria para extensão, sem óleo.',
      'Não use rímel nem curvex nos fios aplicados.',
      'Durma, de preferência, de barriga para cima.',
    ],
  },
  faq: [
    { q: 'Quanto tempo dura a extensão?', a: 'Com os cuidados certos, o resultado fica bonito por 3 a 4 semanas. A manutenção repõe os fios que caem com o ciclo natural.' },
    { q: 'O procedimento dói?', a: 'Não. Você fica deitada, de olhos fechados, e a aplicação é feita fio a fio, sem contato com a pele.' },
    { q: 'Estraga os meus cílios naturais?', a: 'Quando aplicada com técnica, peso adequado e cuidados em casa, a extensão não prejudica os fios naturais.' },
    { q: 'Posso fazer se tiver alergia?', a: 'Trabalho com materiais hipoalergênicos, mas é importante me avisar antes. Em alguns casos indico um teste prévio.' },
  ],
  policies: {
    late: 'Tolerância de 15 minutos. Após esse tempo, o atendimento pode ser reduzido ou reagendado para não atrasar a próxima cliente.',
    cancellation: 'Cancelamentos devem ser avisados com pelo menos 24 horas de antecedência pelo WhatsApp.',
    reschedule: 'Reagendamentos podem ser feitos uma vez, com 24 horas de antecedência, sujeitos à disponibilidade da agenda.',
  },
};

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Mescla o conteúdo salvo sobre o padrão, campo a campo. */
export function mergeContent(saved: unknown, base: SiteContent = DEMO_CONTENT): SiteContent {
  if (!isObj(saved)) return structuredClone(base);
  const out: Json = structuredClone(base) as unknown as Json;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) continue;
    if (isObj(v) && isObj(out[k])) {
      out[k] = { ...(out[k] as Json), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) };
    } else {
      out[k] = v;
    }
  }
  return out as unknown as SiteContent;
}

/** Conteúdo "vazio" é aquele que ainda não recebeu o nome do estúdio. */
export function isDemoContent(saved: unknown): boolean {
  return !isObj(saved) || !saved.studioName;
}

export function instagramUrl(handle: string): string {
  const h = handle.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
  return `https://instagram.com/${h}`;
}

export function instagramHandle(handle: string): string {
  return '@' + handle.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
}

export const DEMO_SERVICES: Service[] = [
  {
    id: 'demo-1', name: 'Fio a fio clássico', type: 'aplicacao', duration_minutes: 120, price_cents: 16000,
    price_is_from: false, description: 'Um fio sintético aplicado sobre cada fio natural. Efeito rímel, natural e delicado.',
    image_url: null, image_path: null, active: true, featured: true, sort_order: 1, maintenance_interval_days: 18, maintenance_rules: null,
  },
  {
    id: 'demo-2', name: 'Volume brasileiro', type: 'aplicacao', duration_minutes: 150, price_cents: 18000,
    price_is_from: false, description: 'Fios em formato de Y que trazem mais preenchimento com leveza. O queridinho do dia a dia.',
    image_url: null, image_path: null, active: true, featured: true, sort_order: 2, maintenance_interval_days: 18, maintenance_rules: null,
  },
  {
    id: 'demo-3', name: 'Volume russo', type: 'aplicacao', duration_minutes: 180, price_cents: 22000,
    price_is_from: true, description: 'Leques feitos à mão para um olhar marcante, denso e sofisticado.',
    image_url: null, image_path: null, active: true, featured: true, sort_order: 3, maintenance_interval_days: 18, maintenance_rules: null,
  },
  {
    id: 'demo-4', name: 'Manutenção', type: 'manutencao', duration_minutes: 90, price_cents: 11000,
    price_is_from: true, description: 'Reposição dos fios que caíram naturalmente, mantendo o desenho sempre bonito.',
    image_url: null, image_path: null, active: true, featured: false, sort_order: 1, maintenance_interval_days: 18,
    maintenance_rules: 'Válida até 21 dias após a última aplicação.',
  },
  {
    id: 'demo-5', name: 'Remoção segura', type: 'remocao', duration_minutes: 30, price_cents: 5000,
    price_is_from: false, description: 'Retirada com removedor próprio, sem puxar e sem danificar os fios naturais.',
    image_url: null, image_path: null, active: true, featured: false, sort_order: 1, maintenance_interval_days: null, maintenance_rules: null,
  },
];

// ---------- Cores ----------------------------------------------------
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const la = luminance(ra), lb = luminance(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(hex: string, withHex: string, amount: number): string {
  const a = hexToRgb(hex), b = hexToRgb(withHex);
  if (!a || !b) return hex;
  const c = a.map((v, i) => Math.round(v * (1 - amount) + b[i] * amount));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Aplica as cores da marca garantindo contraste legível nos botões. */
export function applyBrandColors(colors: { accent?: string; blush?: string }) {
  const root = document.documentElement;
  const accent = hexToRgb(colors.accent ?? '') ? colors.accent! : DEFAULT_ACCENT;
  const blush = hexToRgb(colors.blush ?? '') ? colors.blush! : DEFAULT_BLUSH;
  // Se a cor escolhida for clara demais para texto branco, escurece até ficar legível.
  let safeAccent = accent;
  for (let i = 0; i < 10 && contrastRatio(safeAccent, '#ffffff') < 4.5; i++) {
    safeAccent = mix(safeAccent, '#2b1a1d', 0.12);
  }
  root.style.setProperty('--accent', safeAccent);
  root.style.setProperty('--accent-hover', mix(safeAccent, '#2b1a1d', 0.14));
  root.style.setProperty('--accent-soft', mix(accent, '#ffffff', 0.86));
  root.style.setProperty('--accent-line', mix(accent, '#ffffff', 0.62));
  root.style.setProperty('--blush', blush);
  root.style.setProperty('--blush-soft', mix(blush, '#ffffff', 0.5));
  root.style.setProperty('--blush-deep', mix(blush, safeAccent, 0.18));
}
