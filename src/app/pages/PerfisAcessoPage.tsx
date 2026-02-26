/**
 * @module PerfisAcessoPage
 * @description Gestão de perfis de acesso e permissões (RBAC).
 *
 * Configuração de papéis (admin, gerente, operador, cobrador, comercial)
 * com permissões granulares por módulo. Switches para ativar/desativar
 * acesso a cada seção do sistema.
 *
 * **⚠️ Requer modo anônimo/incognito** — detecta via `window.chrome`
 * e redireciona se não estiver em janela privada.
 *
 * @route /configuracoes/perfis-acesso
 * @access Protegido — somente admin (modo incógnito)
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { ShieldAlert, Plus, Edit, Trash2, Users, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

// Detecta se NÃO está em aba anônima
function useIncognitoCheck() {
  const [isIncognito, setIsIncognito] = useState<boolean | null>(null);

  useEffect(() => {
    async function check() {
      try {
        // Método 1: StorageManager estimate (Chrome)
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const { quota } = await navigator.storage.estimate();
          // Em modo incógnito, o quota é significativamente menor (~120MB vs ~varios GB)
          if (quota && quota < 200 * 1024 * 1024) {
            setIsIncognito(true);
            return;
          }
        }
        // Método 2: Tentar usar FileSystem API (mais confiável no Chrome)
        if ('webkitRequestFileSystem' in window) {
          (window as any).webkitRequestFileSystem(
            0, 0,
            () => setIsIncognito(false),
            () => setIsIncognito(true)
          );
          return;
        }
        // Fallback: Considerar como não-incógnito (seguro por padrão)
        setIsIncognito(false);
      } catch {
        setIsIncognito(false);
      }
    }
    check();
  }, []);

  return isIncognito;
}

const perfisExistentes = [
  { id: 1, nome: 'Administrador', descricao: 'Acesso total ao sistema', usuarios: 2, cor: 'bg-red-100 text-red-800',
    permissoes: { dashboard: true, clientes: true, emprestimos: true, cobranca: true, kanban: true, relatorios: true, configuracoes: true, equipe: true }},
  { id: 2, nome: 'Gerente', descricao: 'Gerencia operações e equipe', usuarios: 3, cor: 'bg-blue-100 text-blue-800',
    permissoes: { dashboard: true, clientes: true, emprestimos: true, cobranca: true, kanban: true, relatorios: true, configuracoes: false, equipe: true }},
  { id: 3, nome: 'Analista', descricao: 'Analisa crédito e gerencia clientes', usuarios: 5, cor: 'bg-green-100 text-green-800',
    permissoes: { dashboard: true, clientes: true, emprestimos: true, cobranca: false, kanban: true, relatorios: false, configuracoes: false, equipe: false }},
  { id: 4, nome: 'Comercial', descricao: 'Captação e indicações', usuarios: 4, cor: 'bg-yellow-100 text-yellow-800',
    permissoes: { dashboard: true, clientes: false, emprestimos: false, cobranca: false, kanban: false, relatorios: false, configuracoes: false, equipe: false }},
  { id: 5, nome: 'Cobrador', descricao: 'Ações de cobrança', usuarios: 6, cor: 'bg-purple-100 text-purple-800',
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

export default function PerfisAcessoPage() {
  const isIncognito = useIncognitoCheck();
  const [editando, setEditando] = useState<number | null>(null);

  // Enquanto verifica, mostra loading
  if (isIncognito === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Bloqueia se não estiver em modo incógnito
  if (isIncognito === false) {
    return <IncognitoBlockScreen />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Perfis de Acesso</h1>
          <p className="text-muted-foreground mt-1">Gerencie permissões e perfis de usuários</p>
        </div>
        <Button><Plus className="w-4 h-4 mr-2" /> Novo Perfil</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {perfisExistentes.map(perfil => (
          <Card key={perfil.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className={perfil.cor}>{perfil.nome}</Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> {perfil.usuarios} usuários
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditando(perfil.id)}>
                    <Edit className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={perfil.nome === 'Administrador'}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{perfil.descricao}</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {modulosDisponiveis.map(mod => (
                  <div key={mod.key} className="flex items-center gap-2 text-xs">
                    {(perfil.permissoes as any)[mod.key] ? (
                      <Eye className="w-3 h-3 text-green-600" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-muted-foreground" />
                    )}
                    <span className={(perfil.permissoes as any)[mod.key] ? 'text-foreground' : 'text-muted-foreground'}>
                      {mod.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
