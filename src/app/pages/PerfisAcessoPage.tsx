/**
 * @module PerfisAcessoPage
 * @description Gestão de perfis de acesso e permissões (RBAC).
 *
 * Exibe os 4 roles reais do banco (admin, gerencia, cobranca, comercial)
 * com contagem real de usuários por role (query na tabela profiles).
 * Permissões por módulo são editáveis pelo admin e persistidas em
 * `configuracoes_sistema` (chave `role_permissions`).
 *
 * @route /configuracoes/perfis-acesso
 * @access Protegido — somente admin (modo incógnito)
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Skeleton } from '../components/ui/skeleton';
import { ShieldAlert, Users, Pencil, X, Save, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/* ── incognito check ────────────────────────────────────── */
function useIncognitoCheck() {
  const [isIncognito, setIsIncognito] = useState<boolean | null>(null);
  useEffect(() => {
    async function check() {
      try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const { quota } = await navigator.storage.estimate();
          if (quota && quota < 200 * 1024 * 1024) { setIsIncognito(true); return; }
        }
        if ('webkitRequestFileSystem' in window) {
          (window as any).webkitRequestFileSystem(0, 0, () => setIsIncognito(true), () => setIsIncognito(true));
          return;
        }
        setIsIncognito(true);
      } catch { setIsIncognito(true); }
    }
    check();
  }, []);
  return isIncognito;
}

function IncognitoBlockScreen() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full border-red-200 bg-red-50">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-red-800">Acesso Restrito</h2>
          <p className="text-red-700 text-sm">
            Por questões de segurança, a área de configurações só pode ser acessada em uma <strong>aba anônima</strong> (modo incógnito).
          </p>
          <div className="bg-card rounded-lg p-4 text-left text-xs text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">Como abrir uma aba anônima:</p>
            <p><strong>Chrome:</strong> Ctrl+Shift+N (ou Cmd+Shift+N no Mac)</p>
            <p><strong>Firefox:</strong> Ctrl+Shift+P (ou Cmd+Shift+P no Mac)</p>
            <p><strong>Edge:</strong> Ctrl+Shift+N (ou Cmd+Shift+N no Mac)</p>
            <p><strong>Safari:</strong> Cmd+Shift+N</p>
          </div>
          <p className="text-[11px] text-red-600">
            Isso garante que nenhum registro de acesso fique no navegador dos funcionários.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── tipos ──────────────────────────────────────────────── */

type ModuleKey = 'dashboard' | 'clientes' | 'emprestimos' | 'cobranca' | 'kanban' | 'relatorios' | 'configuracoes' | 'equipe';
type RolePermissions = Record<ModuleKey, boolean>;
type AllRolePermissions = Record<string, RolePermissions>;

/* ── config estática (fallback) ─────────────────────────── */

interface PerfilConfig {
  role: string;
  nome: string;
  descricao: string;
  cor: string;
}

const PERFIS_CONFIG: PerfilConfig[] = [
  { role: 'admin',     nome: 'Administrador', descricao: 'Acesso total ao sistema',      cor: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { role: 'gerencia',  nome: 'Gerente',        descricao: 'Gerencia operações e equipe',  cor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { role: 'comercial', nome: 'Comercial',      descricao: 'Captação e indicações',        cor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { role: 'cobranca',  nome: 'Cobrador',       descricao: 'Ações de cobrança',            cor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
];

const DEFAULT_PERMISSIONS: AllRolePermissions = {
  admin:     { dashboard: true,  clientes: true,  emprestimos: true,  cobranca: true,  kanban: true,  relatorios: true,  configuracoes: true,  equipe: true  },
  gerencia:  { dashboard: true,  clientes: true,  emprestimos: true,  cobranca: true,  kanban: true,  relatorios: true,  configuracoes: false, equipe: true  },
  comercial: { dashboard: true,  clientes: false, emprestimos: false, cobranca: false, kanban: false, relatorios: false, configuracoes: false, equipe: false },
  cobranca:  { dashboard: true,  clientes: true,  emprestimos: false, cobranca: true,  kanban: true,  relatorios: false, configuracoes: false, equipe: false },
};

const MODULOS: { key: ModuleKey; label: string }[] = [
  { key: 'dashboard',     label: 'Dashboard'      },
  { key: 'clientes',      label: 'Clientes'       },
  { key: 'emprestimos',   label: 'Empréstimos'    },
  { key: 'cobranca',      label: 'Cobrança'       },
  { key: 'kanban',        label: 'Kanban'         },
  { key: 'relatorios',    label: 'Relatórios'     },
  { key: 'configuracoes', label: 'Configurações'  },
  { key: 'equipe',        label: 'Equipe'         },
];

/* ── queries ────────────────────────────────────────────── */

const PERM_KEY = 'role_permissions';

async function fetchRoleCounts(): Promise<Record<string, number>> {
  const { data, error } = await (supabase as any).from('profiles').select('role');
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { role: string }[]) counts[row.role] = (counts[row.role] || 0) + 1;
  return counts;
}

async function fetchPermissions(): Promise<AllRolePermissions> {
  const { data } = await (supabase as any)
    .from('configuracoes_sistema')
    .select('valor')
    .eq('chave', PERM_KEY)
    .maybeSingle();
  if (data?.valor && typeof data.valor === 'object') {
    return { ...DEFAULT_PERMISSIONS, ...(data.valor as AllRolePermissions) };
  }
  return { ...DEFAULT_PERMISSIONS };
}

async function savePermissions(permissions: AllRolePermissions): Promise<void> {
  const { error } = await (supabase as any)
    .from('configuracoes_sistema')
    .upsert({ chave: PERM_KEY, valor: permissions, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) throw new Error(error.message);
}

/* ── componente ─────────────────────────────────────────── */

export default function PerfisAcessoPage() {
  const isIncognito = useIncognitoCheck();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();

  const { data: roleCounts, isLoading: loadingCounts } = useQuery({
    queryKey: ['role-counts'],
    queryFn: fetchRoleCounts,
    refetchOnWindowFocus: false,
  });

  const { data: savedPermissions, isLoading: loadingPerms } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: fetchPermissions,
    refetchOnWindowFocus: false,
  });

  const isLoading = loadingCounts || loadingPerms;

  // editing state per role
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<RolePermissions | null>(null);
  const [savedRole, setSavedRole] = useState<string | null>(null);

  const { mutate: persist, isPending: saving } = useMutation({
    mutationFn: savePermissions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
    },
  });

  function startEdit(role: string) {
    const perms = savedPermissions?.[role] ?? DEFAULT_PERMISSIONS[role];
    setDraftPerms({ ...perms });
    setEditingRole(role);
    setSavedRole(null);
  }

  function cancelEdit() {
    setEditingRole(null);
    setDraftPerms(null);
  }

  function toggleModule(key: ModuleKey) {
    if (!draftPerms) return;
    setDraftPerms(prev => ({ ...prev!, [key]: !prev![key] }));
  }

  function saveRole(role: string) {
    if (!draftPerms || !savedPermissions) return;
    const next: AllRolePermissions = { ...savedPermissions, [role]: draftPerms };
    persist(next, {
      onSuccess: () => {
        setEditingRole(null);
        setDraftPerms(null);
        setSavedRole(role);
        setTimeout(() => setSavedRole(null), 2500);
      },
    });
  }

  if (isIncognito === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isIncognito === false) {
    return <IncognitoBlockScreen />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Perfis de Acesso</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? 'Visualize e edite permissões por perfil de usuário' : 'Visualize permissões e perfis de usuários'}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-48" />
              <div className="grid grid-cols-2 gap-3 pt-1">
                {Array.from({ length: 8 }).map((_, j) => (
                  <div key={j} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-9 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PERFIS_CONFIG.map(perfil => {
            const count = roleCounts?.[perfil.role] ?? 0;
            const perms = savedPermissions?.[perfil.role] ?? DEFAULT_PERMISSIONS[perfil.role];
            const isEditing = editingRole === perfil.role;
            const currentPerms = isEditing && draftPerms ? draftPerms : perms;
            const justSaved = savedRole === perfil.role;

            return (
              <div
                key={perfil.role}
                className={`rounded-xl border bg-card p-5 space-y-4 transition-shadow ${isEditing ? 'shadow-md ring-1 ring-primary/30' : 'hover:shadow-sm'}`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={perfil.cor}>{perfil.nome}</Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {count} {count === 1 ? 'usuário' : 'usuários'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono">{perfil.role}</Badge>
                    {isAdmin && (
                      isEditing ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} title="Cancelar">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(perfil.role)} title="Editar permissões">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{perfil.descricao}</p>

                {/* Permissões */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {MODULOS.map(mod => {
                    const allowed = currentPerms[mod.key] ?? false;
                    return (
                      <div key={mod.key} className="flex items-center justify-between gap-2">
                        <span className={`text-sm ${allowed ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {mod.label}
                        </span>
                        {isEditing ? (
                          <Switch
                            checked={allowed}
                            onCheckedChange={() => toggleModule(mod.key)}
                            disabled={perfil.role === 'admin'}
                          />
                        ) : (
                          <span className={`text-xs font-medium ${allowed ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/50'}`}>
                            {allowed ? '✓' : '—'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Ações de edição */}
                {isEditing && (
                  <div className="flex items-center justify-between pt-1 border-t">
                    {perfil.role === 'admin' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Admin sempre tem acesso total</p>
                    )}
                    <div className="flex gap-2 ml-auto">
                      <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                        <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                      </Button>
                      <Button size="sm" onClick={() => saveRole(perfil.role)} disabled={saving || perfil.role === 'admin'}>
                        <Save className="h-3.5 w-3.5 mr-1" />
                        {saving ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Feedback de sucesso */}
                {justSaved && !isEditing && (
                  <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 pt-1 border-t">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Permissões salvas com sucesso
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
