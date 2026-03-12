/**
 * @module templatesService
 * @description Serviço CRUD para templates WhatsApp via Supabase.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  TemplateWhatsApp,
  TemplateWhatsAppInsert,
  TemplateWhatsAppUpdate,
} from '../lib/database.types';
// ── Queries ────────────────────────────────────────────────

/** Buscar todos os templates */
export async function getTemplates(): Promise<TemplateWhatsApp[]> {

  const { data, error } = await supabase
    .from('templates_whatsapp')
    .select('*')
    .order('nome');

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar templates ativos por categoria */
export async function getTemplatesByCategoria(categoria: string): Promise<TemplateWhatsApp[]> {

  const { data, error } = await supabase
    .from('templates_whatsapp')
    .select('*')
    .eq('categoria', categoria)
    .eq('ativo', true)
    .order('nome');

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Buscar template por ID */
export async function getTemplateById(id: string): Promise<TemplateWhatsApp | null> {

  const { data, error } = await supabase
    .from('templates_whatsapp')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── Mutations ──────────────────────────────────────────────

/** Criar template */
export async function createTemplate(template: TemplateWhatsAppInsert): Promise<TemplateWhatsApp> {

  const { data, error } = await supabase
    .from('templates_whatsapp')
    .insert(template)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Atualizar template */
export async function updateTemplate(
  id: string,
  updates: TemplateWhatsAppUpdate
): Promise<TemplateWhatsApp> {

  const { data, error } = await supabase
    .from('templates_whatsapp')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Excluir template */
export async function deleteTemplate(id: string): Promise<void> {

  const { error } = await supabase
    .from('templates_whatsapp')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Alternar ativo/inativo */
export async function toggleTemplateAtivo(id: string, ativo: boolean): Promise<TemplateWhatsApp> {
  return updateTemplate(id, { ativo });
}
