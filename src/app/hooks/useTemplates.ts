/**
 * @module useTemplates
 * @description React Query hooks para templates WhatsApp.
 *
 * @example
 * ```tsx
 * const { data: templates } = useTemplates();
 * const criar = useCreateTemplate();
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as templatesService from '../services/templatesService';
import { dbTemplateToView } from '../lib/adapters';
import type { TemplateWhatsAppInsert, TemplateWhatsAppUpdate } from '../lib/database.types';

const QUERY_KEY = 'templates';

/** Buscar todos os templates — retorna camelCase */
export function useTemplates() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: () => templatesService.getTemplates(),
    select: (data) => data.map(dbTemplateToView),
  });
}

/** Buscar templates por categoria — retorna camelCase */
export function useTemplatesByCategoria(categoria: string) {
  return useQuery({
    queryKey: [QUERY_KEY, 'categoria', categoria],
    queryFn: () => templatesService.getTemplatesByCategoria(categoria),
    select: (data) => data.map(dbTemplateToView),
  });
}

/** Buscar template por ID — retorna camelCase */
export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => templatesService.getTemplateById(id!),
    enabled: !!id,
    select: (data) => (data ? dbTemplateToView(data) : null),
  });
}

/** Criar template */
export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TemplateWhatsAppInsert) => templatesService.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Atualizar template */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TemplateWhatsAppUpdate }) =>
      templatesService.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Excluir template */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => templatesService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Toggle ativo/inativo */
export function useToggleTemplateAtivo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      templatesService.toggleTemplateAtivo(id, ativo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
