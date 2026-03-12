/**
 * @module useAdminUsers
 * @description React Query hooks para gerenciamento de usuários (admin).
 *
 * @example
 * ```tsx
 * const { data: users } = useAdminUsers();
 * const criar = useCreateUser();
 * criar.mutate({ email: 'novo@email.com', password: '123456', name: 'Novo', role: 'comercial' });
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminUsersService from '../services/adminUsersService';

const QUERY_KEY = 'admin-users';

/** Listar todos os usuários */
export function useAdminUsers() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: () => adminUsersService.getUsers(),
  });
}

/** Criar novo usuário */
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string; name: string; role: string }) =>
      adminUsersService.createUser(data),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      }
    },
  });
}

/** Alterar role de usuário */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      adminUsersService.updateUserRole(userId, role),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      }
    },
  });
}

/** Excluir usuário */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => adminUsersService.deleteUser(userId),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      }
    },
  });
}

/** Atualizar nome do usuário */
export function useUpdateUserName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, name }: { userId: string; name: string }) =>
      adminUsersService.updateUserName(userId, name),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      }
    },
  });
}
