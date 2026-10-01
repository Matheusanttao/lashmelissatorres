import { normalizePhone, formatLongDate, formatTime, firstName } from './format';

/** Link wa.me para abrir o WhatsApp com mensagem pronta (envio manual). */
export function whatsappLink(phone: string, message?: string): string {
  const digits = normalizePhone(phone);
  const full = digits.length >= 10 && digits.length <= 11 ? `55${digits}` : digits;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${full}${text}`;
}

export interface TemplateVars {
  nome?: string;
  estudio?: string;
  servico?: string;
  data?: string;
  hora?: string;
}

export function fillTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (_, key: keyof TemplateVars) => vars[key] ?? '');
}

export function appointmentVars(opts: {
  clientName: string;
  studioName: string;
  serviceName: string;
  startsAt: string;
}): TemplateVars {
  return {
    nome: firstName(opts.clientName),
    estudio: opts.studioName,
    servico: opts.serviceName,
    data: formatLongDate(opts.startsAt),
    hora: formatTime(opts.startsAt),
  };
}

export const DEFAULT_TEMPLATES = {
  confirm:
    'Oi, {nome}! Aqui é do {estudio}. Seu horário de {servico} está confirmado para {data} às {hora}. Qualquer imprevisto, é só me avisar por aqui. Até lá!',
  reminder:
    'Oi, {nome}! Passando para lembrar do seu horário de {servico} em {data} às {hora}. Venha sem maquiagem nos olhos, combinado? Te espero com carinho.',
  maintenance:
    'Oi, {nome}! Já está chegando a hora da manutenção dos seus cílios ({servico}). Quer que eu reserve um horário para você?',
};
