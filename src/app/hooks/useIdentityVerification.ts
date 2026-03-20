/**
 * @module useIdentityVerification
 * @description React Query hooks para verificação de identidade.
 *
 * Hooks: useVerification, useVerificationsByAnalise, useVerificationsByStatus,
 * usePendingVerifications, useCreateVerification, useUpdateVerification,
 * useVerificationLogs, useCreateVerificationLog, useUploadVerificationFile
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as verificationService from '../services/identityVerificationService';
import { dbIdentityVerificationToView, dbVerificationLogToView } from '../lib/adapters';
import type {
  IdentityVerificationInsert,
  IdentityVerificationUpdate,
  VerificationLogInsert,
  VerificationStatus,
} from '../lib/database.types';

const QUERY_KEY = 'identity-verifications';
const LOGS_KEY = 'verification-logs';

/** Buscar verificação por ID — retorna camelCase */
export function useVerification(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => verificationService.getVerificationById(id!),
    enabled: !!id,
    select: (data) => (data ? dbIdentityVerificationToView(data) : null),
  });
}

/** Buscar verificações de uma análise — retorna camelCase */
export function useVerificationsByAnalise(analiseId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'by-analise', analiseId],
    queryFn: () => verificationService.getVerificationsByAnalise(analiseId!),
    enabled: !!analiseId,
    select: (data) => data.map(dbIdentityVerificationToView),
  });
}

/** Buscar verificações por status (fila do analista) — retorna camelCase */
export function useVerificationsByStatus(status: VerificationStatus) {
  return useQuery({
    queryKey: [QUERY_KEY, 'by-status', status],
    queryFn: () => verificationService.getVerificationsByStatus(status),
    select: (data) => data.map(dbIdentityVerificationToView),
  });
}

/** Buscar verificações pendentes com mídia enviada (fila de revisão) */
export function usePendingVerifications() {
  return useQuery({
    queryKey: [QUERY_KEY, 'pending'],
    queryFn: () => verificationService.getPendingVerifications(),
    select: (data) => data.map(dbIdentityVerificationToView),
  });
}

/** Criar nova verificação */
export function useCreateVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IdentityVerificationInsert) =>
      verificationService.createVerification(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['analises-credito'] });
    },
  });
}

/** Atualizar verificação (status, URLs, etc.) */
export function useUpdateVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: IdentityVerificationUpdate }) =>
      verificationService.updateVerification(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['analises-credito'] });
    },
  });
}

/** Buscar logs de uma verificação — retorna camelCase */
export function useVerificationLogs(verificationId: string | undefined) {
  return useQuery({
    queryKey: [LOGS_KEY, verificationId],
    queryFn: () => verificationService.getVerificationLogs(verificationId!),
    enabled: !!verificationId,
    select: (data) => data.map(dbVerificationLogToView),
  });
}

/** Registrar ação no log de auditoria */
export function useCreateVerificationLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (log: VerificationLogInsert) =>
      verificationService.createVerificationLog(log),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [LOGS_KEY, variables.verification_id] });
    },
  });
}

/** Upload de arquivo de verificação (vídeo ou documento) */
export function useUploadVerificationFile() {
  return useMutation({
    mutationFn: ({ file, path }: { file: File | Blob; path: string }) =>
      verificationService.uploadVerificationFile(file, path),
  });
}
