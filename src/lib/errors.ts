/** Converte erros do Supabase/Postgres em mensagens claras em português. */
export function friendlyError(err: unknown, fallback = 'Não foi possível concluir. Tente novamente.'): string {
  if (!err) return fallback;
  const e = err as { message?: string; code?: string; details?: string; status?: number; name?: string };
  const msg = e.message ?? String(err);

  if (e.code === '23P01' || msg.includes('appointments_no_overlap')) {
    return 'Esse horário se sobrepõe a outro atendimento. Escolha outro horário.';
  }
  if (e.code === '23505') {
    if (msg.includes('clients_whatsapp_unique')) return 'Já existe uma cliente cadastrada com esse WhatsApp.';
    return 'Esse registro já existe.';
  }
  if (e.code === '23503') {
    if (msg.includes('consent')) return 'Essa autorização está vinculada a fotos da galeria. Revogue em vez de excluir.';
    if (msg.includes('appointments')) return 'Existem atendimentos ligados a este cadastro, por isso ele não pode ser excluído.';
    return 'Esse item está sendo usado em outro cadastro e não pode ser excluído.';
  }
  if (e.code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return 'Você não tem permissão para esta ação.';
  }
  if (e.code === 'P0001') return msg;
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('rate limit') || e.status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  }
  if (msg.includes('Password should be')) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (msg.includes('The resource already exists')) return 'Já existe um arquivo com esse nome.';
  if (msg.includes('mime type') || msg.includes('invalid_mime_type')) return 'Formato de arquivo não permitido.';
  if (msg.includes('exceeded the maximum allowed size') || msg.includes('Payload too large')) {
    return 'Arquivo muito grande. Envie imagens de até 8 MB.';
  }
  if (msg.includes('Supabase ainda não foi configurado')) return msg;
  return fallback;
}
