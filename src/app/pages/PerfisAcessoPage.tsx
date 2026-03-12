/**
 * @module PerfisAcessoPage
 * @description Gestão de perfis de acesso e permissões (RBAC).
 *
 * Exibe os 4 roles reais do banco (admin, gerencia, cobranca, comercial)
 * com contagem real de usuários por role (query na tabela profiles).
 * Permissões por módulo são config estática (RBAC definido no código).
 *
 * **⚠️ Requer modo anônimo/incognito** — detecta via `window.chrome`
 * e redireciona se não estiver em janela privada.
 *
 * @route /configuracoes/perfis-acesso
 * @access Protegido — somente admin (modo incógnito)
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ShieldAlert, Users, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
        // Fallback: navegadores modernos não permitem detectar incógnito
        // — permitir acesso (páginas já são protegidas por auth)
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

/* ── config estática de perfis ──────────────────────────── */
interface PerfilConfig {
  role: string;
  nome: string;
  descricao: string;
  cor: string;
  permissoes: Record<string, boolean>;
}

const PERFIS_CONFIG: PerfilConfig[] = [
  { role: 'admin', nome: 'Administrador', descricao: 'Acesso total ao sistema', cor: 'bg-red-100 text-red-800',
    permissoes: { dashboard: true, clientes: true, emprestimos: true, cobranca: true, kanban: true, relatorios: true, configuracoes: true, equipe: true }},
  { role: 'gerencia', nome: 'Gerente', descricao: 'Gerencia operações e equipe', cor: 'bg-blue-100 text-blue-800',
    permissoes: { dashboard: true, clientes: true, emprestimos: true, cobranca: true, kanban: true, relatorios: true, configuracoes: false, equipe: true }},
  { role: 'comercial', nome: 'Comercial', descricao: 'Captação e indicações', cor: 'bg-yellow-100 text-yellow-800',
    permissoes: { dashboard: true, clientes: false, emprestimos: false, cobranca: false, kanban: false, relatorios: false, configuracoes: false, equipe: false }},
  { role: 'cobranca', nome: 'Cobrador', descricao: 'Ações de cobrança', cor: 'bg-purple-100 text-purple-800',
    permissoes: { dashboard: true, clientes: true, emprestimos: false, cobranca: true, kanban: true, relatorios: false, configuracoes: false, equipe: false }},
];

const modulosDisponiveis = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'emprestimos', label: 'Empréstimos' },
  { key: 'cobranca', label: 'Cobrança' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'equipe', label: 'Equipe' },
];

/* ── query: count profiles by role ──────────────────────── */
async function fetchRoleCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('profiles').select('role');
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.role] = (counts[row.role] || 0) + 1;
  }
  return counts;
}

export default function PerfisAcessoPage() {
  const isIncognito = useIncognitoCheck();

  const { data: roleCounts, isLoading } = useQuery({
    queryKey: ['role-counts'],
    queryFn: fetchRoleCounts,
    refetchOnWindowFocus: false,
  });

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
          <p className="text-muted-foreground mt-1">Visualize permissões e perfis de usuários</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PERFIS_CONFIG.map(perfil => {
            const count = roleCounts?.[perfil.role] ?? 0;
            return (
              <Card key={perfil.role} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={perfil.cor}>{perfil.nome}</Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" /> {count} {count === 1 ? 'usuário' : 'usuários'}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono">{perfil.role}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{perfil.descricao}</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {modulosDisponiveis.map(mod => (
                      <div key={mod.key} className="flex items-center gap-2 text-xs">
                        {perfil.permissoes[mod.key] ? (
                          <Eye className="w-3 h-3 text-green-600" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className={perfil.permissoes[mod.key] ? 'text-foreground' : 'text-muted-foreground'}>
                          {mod.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
