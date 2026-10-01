import { db, PRIVATE_BUCKET, PUBLIC_BUCKET } from './supabase';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_PUBLIC = 8 * 1024 * 1024;

export function validateImage(file: File, maxBytes = MAX_PUBLIC): string | null {
  if (!IMAGE_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    return 'Envie uma imagem em JPG, PNG ou WEBP.';
  }
  if (file.size > maxBytes) return `A imagem precisa ter até ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  return null;
}

/**
 * Reduz fotos grandes do celular antes de enviar (máx. 2000px, JPEG).
 * Mantém o arquivo original se o navegador não conseguir processar.
 */
export async function compressImage(file: File, maxSize = 2000, quality = 0.86): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function randomName(file: File): string {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
}

/** Envia imagem pública (site). Retorna o caminho e a URL pública. */
export async function uploadPublicImage(file: File, folder: string): Promise<{ path: string; url: string }> {
  const processed = await compressImage(file);
  const path = `${folder}/${randomName(processed)}`;
  const { error } = await db().storage.from(PUBLIC_BUCKET).upload(path, processed, {
    cacheControl: '31536000',
    contentType: processed.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = db().storage.from(PUBLIC_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/** Envia arquivo privado (acompanhamento / autorizações). Retorna o caminho. */
export async function uploadPrivateFile(file: File, folder: string): Promise<string> {
  const processed = file.type.startsWith('image/') ? await compressImage(file) : file;
  const path = `${folder}/${randomName(processed)}`;
  const { error } = await db().storage.from(PRIVATE_BUCKET).upload(path, processed, {
    contentType: processed.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function signedUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await db().storage.from(PRIVATE_BUCKET).createSignedUrls(paths, expiresIn);
  if (error) throw error;
  const map: Record<string, string> = {};
  data?.forEach((d) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}

export async function removePublic(paths: (string | null | undefined)[]) {
  const list = paths.filter(Boolean) as string[];
  if (list.length) await db().storage.from(PUBLIC_BUCKET).remove(list);
}

export async function removePrivate(paths: (string | null | undefined)[]) {
  const list = paths.filter(Boolean) as string[];
  if (list.length) await db().storage.from(PRIVATE_BUCKET).remove(list);
}

/** Extrai o caminho do arquivo a partir de uma URL pública do bucket. */
export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/object/public/${PUBLIC_BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}
