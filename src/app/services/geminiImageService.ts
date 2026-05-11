/**
 * @module geminiImageService
 * @description Frontend → Edge Function `generate-image-gemini` para gerar
 * imagens (Gemini "Nano Banana") e cadastrar automaticamente em
 * `midia_assets` com upload no Cloudinary.
 */
import { supabase } from '../lib/supabase';
import type { MidiaAsset, MidiaTipo } from './midiaAssetsService';

export interface GenerateImageInput {
  prompt: string;
  titulo?: string;
  tipo?: MidiaTipo;
  caption?: string;
}

export async function generateImageWithGemini(input: GenerateImageInput): Promise<MidiaAsset> {
  const { data, error } = await supabase.functions.invoke('generate-image-gemini', {
    body: { ...input, save: true },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return (data as { asset: MidiaAsset }).asset;
}
