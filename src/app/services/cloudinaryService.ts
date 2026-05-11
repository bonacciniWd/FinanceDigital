/**
 * @module cloudinaryService
 * @description Cliente front para Cloudinary — usa Edge Function `cloudinary-sign-upload`
 * para assinar e então faz upload direto pelo browser (multipart/form-data),
 * evitando expor `CLOUDINARY_API_SECRET`.
 *
 * Bucket lógico padrão: pasta `marketing-assets` no Cloudinary.
 *
 * @see supabase/functions/cloudinary-sign-upload/index.ts
 */
import { supabase } from '../lib/supabase';

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  thumbnail_url?: string;
  resource_type: 'image' | 'video' | 'raw';
  format: string;
  duration?: number;
  width?: number;
  height?: number;
  bytes: number;
}

interface SignaturePayload {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  params: Record<string, string | number>;
}

async function getSignature(opts: {
  folder?: string;
  publicId?: string;
  tags?: string[];
}): Promise<SignaturePayload> {
  const { data, error } = await supabase.functions.invoke('cloudinary-sign-upload', {
    body: {
      folder: opts.folder ?? 'marketing-assets',
      ...(opts.publicId ? { public_id: opts.publicId } : {}),
      ...(opts.tags?.length ? { tags: opts.tags.join(',') } : {}),
    },
  });
  if (error) throw error;
  return data as SignaturePayload;
}

/**
 * Upload assinado direto para o Cloudinary.
 *
 * @param file Arquivo a enviar (image ou video)
 * @param opts Opções de pasta/publicId/tags + callback de progresso
 */
export async function uploadSigned(
  file: File,
  opts: {
    folder?: string;
    publicId?: string;
    tags?: string[];
    onProgress?: (pct: number) => void;
  } = {}
): Promise<CloudinaryUploadResult> {
  const sig = await getSignature(opts);
  const isVideo = file.type.startsWith('video/');
  const resourceType = isVideo ? 'video' : 'image';

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.api_key);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  // Demais params devem casar EXATAMENTE com os assinados
  for (const [k, v] of Object.entries(sig.params)) {
    if (k === 'timestamp') continue;
    form.append(k, String(v));
  }

  const url = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resourceType}/upload`;

  return await new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error('Falha de rede no upload Cloudinary'));
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            public_id: json.public_id,
            secure_url: json.secure_url,
            thumbnail_url: json.thumbnail_url,
            resource_type: json.resource_type,
            format: json.format,
            duration: json.duration,
            width: json.width,
            height: json.height,
            bytes: json.bytes,
          });
        } else {
          reject(new Error(json?.error?.message ?? `HTTP ${xhr.status}`));
        }
      } catch (e) {
        reject(e);
      }
    };
    xhr.send(form);
  });
}

/**
 * Gera URL com transformação de thumb (vídeos): primeiro frame em jpg.
 */
export function videoThumbUrl(secureUrl: string): string {
  // .../video/upload/.../public_id.mp4 → .../video/upload/so_0,du_1/public_id.jpg
  return secureUrl
    .replace('/video/upload/', '/video/upload/so_0,w_400,h_400,c_fill/')
    .replace(/\.(mp4|mov|webm|avi)(\?.*)?$/i, '.jpg$2');
}
