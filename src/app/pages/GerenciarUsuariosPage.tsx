/**
 * @module GerenciarUsuariosPage
 * @description Página de gerenciamento de usuários do sistema (admin only).
 *
 * Funcionalidades:
 * - Listar todos os usuários com role, email e data de criação
 * - Criar novo usuário com email/senha/nome/role
 * - Alterar role de um usuário existente
 * - Excluir usuário (com confirmação)
 *
 * Todas as operações passam por Edge Functions que validam
 * o role admin do chamador no server-side.
 *
 * @route /configuracoes/usuarios
 * @access Protegido — somente admin
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { Alert, AlertDescription } from '../components/ui/alert';
import {
  UserPlus,
  Shield,
  Trash2,
  Users,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import {
  useAdminUsers,
  useCreateUser,
  useUpdateUserRole,
  useDeleteUser,
} from '../hooks/useAdminUsers';

// ── Helpers ─────────────────────────────────────────────────

const roleConfig: Record<string, { label: string; color: string; description: string }> = {
  admin: {
    label: 'Administrador',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    description: 'Acesso total ao sistema, incluindo gestão de usuários',
  },
  gerencia: {
    label: 'Gerência',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    description: 'Visualiza todos os dados, gerencia equipe e relatórios',
  },
  cobranca: {
    label: 'Cobrança',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    description: 'Gestão de inadimplentes, parcelas e negociações',
  },
  comercial: {
    label: 'Comercial',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    description: 'Captação de clientes, indicações e análise de crédito',
  },
};

function getRoleConfig(role: string) {
  return roleConfig[role] ?? { label: role, color: 'bg-gray-100 text-gray-800', description: '' };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ── Component ───────────────────────────────────────────────

export default function GerenciarUsuariosPage() {
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading } = useAdminUsers();
  const createUser = useCreateUser();
  const updateRole = useUpdateUserRole();
  const deleteUser = useDeleteUser();

  // Modal novo usuário
  const [modalNovo, setModalNovo] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newRole, setNewRole] = useState('comercial');
  const [createError, setCreateError] = useState('');

  // Modal editar role
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');

  // Modal confirmar exclusão
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  // ── Criar usuário ─────────────────────────────────────────

  const handleCreate = async () => {
    setCreateError('');

    if (!newEmail || !newName || !newPassword || !newRole) {
      setCreateError('Preencha todos os campos');
      return;
    }

    if (newPassword.length < 6) {
      setCreateError('Senha deve ter no mínimo 6 caracteres');
      return;
    }

    const result = await createUser.mutateAsync({
      email: newEmail,
      password: newPassword,
      name: newName,
      role: newRole,
    });

    if (result.success) {
      toast.success(`Usuário ${newName} criado com sucesso!`);
      setModalNovo(false);
      resetNewForm();
    } else {
      setCreateError(result.error ?? 'Erro ao criar usuário');
    }
  };

  const resetNewForm = () => {
    setNewEmail('');
    setNewName('');
    setNewPassword('');
    setShowPassword(false);
    setNewRole('comercial');
    setCreateError('');
  };

  // ── Alterar role ──────────────────────────────────────────

  const handleUpdateRole = async () => {
    if (!editUserId || !editRole) return;

    const result = await updateRole.mutateAsync({ userId: editUserId, role: editRole });

    if (result.success) {
      toast.success('Papel alterado com sucesso!');
      setEditUserId(null);
    } else {
      toast.error(result.error ?? 'Erro ao alterar papel');
    }
  };

  // ── Excluir usuário ───────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteUserId) return;

    const result = await deleteUser.mutateAsync(deleteUserId);

    if (result.success) {
      toast.success('Usuário excluído com sucesso');
      setDeleteUserId(null);
    } else {
      toast.error(result.error ?? 'Erro ao excluir usuário');
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Gerenciar Usuários</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? 'Carregando...' : `${users.length} usuário(s) cadastrado(s)`}
          </p>
        </div>
        <Button onClick={() => setModalNovo(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      {/* Cards de resumo por role */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(roleConfig).map(([key, config]) => {
          const count = users.filter((u) => u.role === key).length;
          return (
            <Card key={key}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                    <p className="text-2xl font-bold mt-1">{count}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.color}`}>
                    <Users className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabela de usuários */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Usuários do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Usuário</th>
                    <th className="text-left py-3 px-4 font-medium">Papel</th>
                    <th className="text-left py-3 px-4 font-medium">Criado em</th>
                    <th className="text-right py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const config = getRoleConfig(u.role);
                    const isSelf = u.id === currentUser?.id;

                    return (
                      <tr key={u.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-primary text-white rounded-full flex items-center justify-center font-semibold text-sm">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium">
                                {u.name}
                                {isSelf && (
                                  <span className="text-xs text-muted-foreground ml-2">(você)</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={config.color}>{config.label}</Badge>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditUserId(u.id);
                                setEditRole(u.role);
                              }}
                              title="Alterar papel"
                            >
                              <Shield className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteUserId(u.id)}
                              disabled={isSelf}
                              title={isSelf ? 'Não é possível excluir sua própria conta' : 'Excluir usuário'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modal: Novo Usuário ──────────────────────────────── */}
      <Dialog
        open={modalNovo}
        onOpenChange={(open) => {
          setModalNovo(open);
          if (!open) resetNewForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Criar Novo Usuário
            </DialogTitle>
            <DialogDescription>
              O usuário receberá acesso com email e senha definidos abaixo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {createError && (
              <Alert variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-name">Nome completo</Label>
              <Input
                id="new-name"
                placeholder="Ex: Maria Silva"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-email">E-mail</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="usuario@empresa.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Papel de acesso</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex flex-col">
                        <span>{config.label}</span>
                        <span className="text-xs text-muted-foreground">{config.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNovo(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createUser.isPending}
            >
              {createUser.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Criar Usuário
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Alterar Role ──────────────────────────────── */}
      <Dialog open={!!editUserId} onOpenChange={() => setEditUserId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Papel</DialogTitle>
            <DialogDescription>
              Altere o nível de acesso de{' '}
              <strong>{users.find((u) => u.id === editUserId)?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={editRole} onValueChange={setEditRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(roleConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {getRoleConfig(editRole).description}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserId(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateRole} disabled={updateRole.isPending}>
              {updateRole.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar Exclusão ────────────────────────── */}
      <Dialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Excluir Usuário
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir{' '}
              <strong>{users.find((u) => u.id === deleteUserId)?.name}</strong>?
              <br />
              Esta ação é irreversível.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Excluir'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
