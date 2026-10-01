/**
 * Upload de imagens via Cloudinary (unsigned upload preset).
 * Configure VITE_CLOUDINARY_CLOUD_NAME e VITE_CLOUDINARY_UPLOAD_PRESET no .env.local.
 *
 * No Cloudinary: Settings → Upload → Upload presets → Add unsigned preset.
 * Pastas sugeridas: site, servicos, galeria, clientes, autorizacoes.
 */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_PUBLIC = 8 * 1024 * 1024;
const MAX_PRIVATE = 15 * 1024 * 1024;

function cloudName(): string {
  const name = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
  if (!name || name.includes('SEU-')) {
    throw new Error('Cloudinary não configurado. Preencha VITE_CLOUDINARY_CLOUD_NAME no .env.local.');
  }
  return name;
}

function uploadPreset(): string {
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;
  if (!preset || preset.includes('SEU-')) {
    throw new Error('Cloudinary não configurado. Preencha VITE_CLOUDINARY_UPLOAD_PRESET no .env.local.');
  }
  return preset;
}

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

type CloudinaryUpload = {
  public_id: string;
  secure_url: string;
  resource_type: string;
};

async function uploadToCloudinary(
  file: File,
  folder: string,
  resourceType: 'image' | 'auto' = 'image',
): Promise<CloudinaryUpload> {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', uploadPreset());
  form.append('folder', folder.replace(/^\/+|\/+$/g, ''));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName()}/${resourceType}/upload`, {
    method: 'POST',
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Falha ao enviar a imagem para o Cloudinary.');
  }
  return data as CloudinaryUpload;
}

function deliveryUrl(publicIdOrUrl: string): string {
  if (publicIdOrUrl.startsWith('http://') || publicIdOrUrl.startsWith('https://')) return publicIdOrUrl;
  return `https://res.cloudinary.com/${cloudName()}/image/upload/${publicIdOrUrl}`;
}

/** Envia imagem pública (site). Retorna o public_id e a URL HTTPS. */
export async function uploadPublicImage(file: File, folder: string): Promise<{ path: string; url: string }> {
  const processed = await compressImage(file);
  const data = await uploadToCloudinary(processed, folder, 'image');
  return { path: data.public_id, url: data.secure_url };
}

/** Envia arquivo privado (acompanhamento / autorizações). Retorna o public_id (ou URL). */
export async function uploadPrivateFile(file: File, folder: string): Promise<string> {
  if (file.size > MAX_PRIVATE) {
    throw new Error(`O arquivo precisa ter até ${Math.round(MAX_PRIVATE / 1024 / 1024)} MB.`);
  }
  const processed = file.type.startsWith('image/') ? await compressImage(file) : file;
  const data = await uploadToCloudinary(processed, folder, 'auto');
  return data.secure_url;
}

/** Resolve URLs de arquivos privados (Cloudinary já devolve URL pública via preset unsigned). */
export async function signedUrls(paths: string[], _expiresIn = 3600): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const p of paths) {
    if (p) map[p] = deliveryUrl(p);
  }
  return map;
}

/**
 * Remoção no Cloudinary exige API secret (só no servidor).
 * Aqui só limpa a referência no app; apague órfãos no painel do Cloudinary se quiser.
 */
export async function removePublic(_paths: (string | null | undefined)[]) {
  /* no-op no frontend */
}

export async function removePrivate(_paths: (string | null | undefined)[]) {
  /* no-op no frontend */
}

/** Extrai o public_id a partir de uma URL do Cloudinary (ou devolve null). */
export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  if (m?.[1]) return decodeURIComponent(m[1].replace(/\.[a-z0-9]+$/i, ''));
  return null;
}
