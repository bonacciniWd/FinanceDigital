📘 GUIDELINES.MD

Diretrizes de Desenvolvimento - FintechFlow

> **Última atualização**: 07/03/2026 (v6.0)  
> **Stack**: React 18 + TypeScript 5 + Vite 6 + Tailwind CSS v4 + Supabase + React Query

---

## 1. PADRÕES DE CÓDIGO

### 1.1 Estrutura de Componentes React (Functional Components + Hooks)

```tsx
/**
 * Nomenclatura: PascalCase para componentes
 * Ex: ClientCard.tsx, LoanTable.tsx
 * Páginas: NomeDaPaginaPage.tsx
 */

// IMPORTS (ordem: react → terceiros → componentes → hooks → lib → tipos)
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Search, Plus, Filter } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useClientes, useUpdateCliente } from '../hooks/useClientes';
import type { Cliente } from '../lib/view-types';

// PROPS (com interface TypeScript)
interface ClientCardProps {
  cliente: Cliente;
  showDetails?: boolean;
  onUpdate?: (cliente: Cliente) => void;
  onClose?: () => void;
}

export default function ClientCard({ cliente, showDetails = false, onUpdate, onClose }: ClientCardProps) {
  // HOOKS — React Query (queries + mutations)
  const { data: clientes, isLoading } = useClientes();
  const updateCliente = useUpdateCliente();

  // HOOKS — Contextos e navegação
  const { user } = useAuth();
  const navigate = useNavigate();

  // STATE LOCAL
  const [editing, setEditing] = useState(false);

  // COMPUTED (useMemo)
  const canEdit = useMemo(() => {
    return user?.role === 'admin' || user?.role === 'gerencia';
  }, [user]);

  // CALLBACKS (useCallback) — IMPORTANTE: sempre antes de early returns
  const handleSave = useCallback(async (data: Partial<Cliente>) => {
    await updateCliente.mutateAsync({ id: cliente.id, data });
    toast.success('Cliente atualizado');
  }, [cliente.id, updateCliente]);

  // EARLY RETURNS — sempre após todos os hooks
  if (isLoading) return <LoadingSpinner />;

  // RENDER
  return (
    <Card>
      <CardContent>{/* JSX */}</CardContent>
    </Card>
  );
}
```

### 1.2 Nomenclatura

```
📁 src/app/
├── 📁 components/
│   ├── MainLayout.tsx         # Layout principal (sidebar + header)
│   ├── ProtectedRoute.tsx     # Auth guard
│   ├── StatusBadge.tsx        # Badge reutilizável
│   └── 📁 ui/                # 46 shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── table.tsx
│       └── ... (+41 componentes)
├── 📁 contexts/
│   ├── AuthContext.tsx         # NÃO use 'react-router-dom', use 'react-router'
│   └── ThemeContext.tsx
├── 📁 hooks/                  # 16 arquivos — React Query hooks
│   ├── useClientes.ts         # use[Domínio].ts
│   ├── useEmprestimos.ts
│   └── ...
├── 📁 services/               # 13 arquivos — camada Supabase
│   ├── clientesService.ts     # [domínio]Service.ts
│   └── ...
├── 📁 lib/
│   ├── view-types.ts          # Interfaces TypeScript (camelCase)
│   ├── database.types.ts      # Tipos gerados do PostgreSQL (snake_case)
│   ├── adapters.ts            # snake_case → camelCase
│   └── supabase.ts            # Client Supabase
└── 📁 pages/                  # 33 páginas — NomeDaPaginaPage.tsx
```

### 1.3 Padrões de Página

Toda página segue esta estrutura:

```tsx
export default function NomeDaPaginaPage() {
  // 1. HOOKS (React Query, contextos, router) — TODOS no topo, antes de qualquer early return
  const { data, isLoading } = useDominio();
  const createMutation = useCreateDominio();
  const { user } = useAuth();
  const navigate = useNavigate();

  // 2. STATE LOCAL
  const [filtro, setFiltro] = useState('');
  const [showDialog, setShowDialog] = useState(false);

  // 3. COMPUTED (useMemo)
  const dadosFiltrados = useMemo(() => {
    return data?.filter(item => item.nome.includes(filtro)) ?? [];
  }, [data, filtro]);

  // 4. CALLBACKS (useCallback) — ANTES de qualquer early return
  const handleExportar = useCallback(() => { /* ... */ }, [dadosFiltrados]);

  // 5. EARLY RETURN (loading)
  if (isLoading) return <div className="flex items-center justify-center h-64">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>;

  // 6. RENDER — Cards de métricas → Filtros → Lista/Tabela → Dialogs
  return (
    <div className="space-y-6">
      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">...</div>
      {/* Filtros + Busca */}
      <div className="flex items-center gap-4">...</div>
      {/* Tabela ou Cards */}
      <Card>...</Card>
      {/* Dialogs */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>...</Dialog>
    </div>
  );
}
```

> ⚠️ **Rules of Hooks**: `useState`, `useEffect`, `useMemo`, `useCallback` e qualquer `use*` DEVEM ser chamados ANTES de qualquer `if (...) return`. Violação causa crash em runtime.

---

## 2. ESTILOS E UI

### 2.1 Tailwind CSS v4 + shadcn/ui

- **Tailwind CSS v4** com `@tailwindcss/vite` plugin (não usa `tailwind.config.js`)
- Configuração em CSS: `src/styles/tailwind.css` + `src/styles/theme.css`
- **Dark mode**: `@custom-variant dark (&:is(.dark *))` no CSS
- **Componentes**: shadcn/ui (Radix UI primitives) em `src/app/components/ui/`

```tsx
// PADRÃO: sempre usar classes dark mode pareadas
<div className="bg-white dark:bg-card text-gray-900 dark:text-gray-100">
<Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
<Card className="border border-gray-200 dark:border-gray-700">
```

### 2.2 Paleta de Cores do Tema

| Variável | Light | Dark |
|----------|-------|------|
| `--background` | `#ffffff` | `#0F1729` |
| `--foreground` | `#2D3748` | `#E2E8F0` |
| `--card` | `#ffffff` | `#1A2332` |
| `--muted` | `#F5F7FA` | `#1E293B` |
| `--primary` | `#0A2472` | `#0A2472` |
| `--destructive` | `#e53e3e` | `#e53e3e` |

### 2.3 Ícones

```tsx
// Lucide React — importar individualmente (tree-shaking)
import { Search, Plus, Filter, ArrowLeft, Download, Star } from 'lucide-react';

// Tamanhos padrão
<Icon className="h-4 w-4" />  // Inline, botões
<Icon className="h-5 w-5" />  // Headers de seção
<Icon className="h-8 w-8" />  // Empty states, métricas
```

---

## 3. GERENCIAMENTO DE ESTADO

### 3.1 React Query (TanStack Query) — Padrão Principal

Toda comunicação com Supabase usa React Query. **Nunca** faça fetch direto em `useEffect`.

```tsx
// PADRÃO COMPLETO: Service → Hook → Página

// 1. SERVICE (src/app/services/clientesService.ts)
export const clientesService = {
  async getClientes(status?: string) {
    let query = supabase.from('clientes').select('*');
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  async createCliente(dados: ClienteInsert) {
    const { data, error } = await supabase.from('clientes').insert(dados).select().single();
    if (error) throw error;
    return data;
  }
};

// 2. HOOK (src/app/hooks/useClientes.ts)
export function useClientes(status?: string) {
  return useQuery({
    queryKey: ['clientes', status],
    queryFn: () => clientesService.getClientes(status),
    select: (data) => data.map(adaptCliente), // snake_case → camelCase
  });
}

export function useCreateCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clientesService.createCliente,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Cliente criado com sucesso');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
}

// 3. PÁGINA
const { data: clientes, isLoading } = useClientes();
const createCliente = useCreateCliente();
// ...
createCliente.mutate(novoCliente);
```

### 3.2 Adapters (snake_case → camelCase)

Todas as respostas do Supabase (snake_case) são convertidas para camelCase via adapters:

```tsx
// src/app/lib/adapters.ts
export function adaptCliente(row: any): Cliente {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    cpf: row.cpf,
    sexo: row.sexo,
    status: row.status,
    limiteCredito: row.limite_credito,    // snake → camel
    creditoUtilizado: row.credito_utilizado,
    scoreInterno: row.score_interno,
    bonusAcumulado: row.bonus_acumulado,
    diasAtraso: row.dias_atraso,
    indicadoPor: row.indicado_por,
    // ...
  };
}
```

### 3.3 View Types

Interfaces TypeScript do domínio em `src/app/lib/view-types.ts` (camelCase):

```tsx
export interface Cliente {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpf?: string;
  sexo: 'masculino' | 'feminino';
  status: string;
  limiteCredito: number;
  creditoUtilizado: number;
  scoreInterno: number;
  bonusAcumulado: number;
  diasAtraso?: number;
  indicadoPor?: string;
  // ...
}
```

### 3.4 React Context — Apenas Auth e Theme

```tsx
// AuthContext — Supabase Auth (JWT)
const { user, login, logout, loading } = useAuth();

// ThemeContext — Dark mode
const { theme, toggleTheme } = useTheme();
```

> **Não** criar novos contextos para dados do domínio. Usar React Query (hooks).

---

## 4. ROTAS E NAVEGAÇÃO

### 4.1 React Router 7

```tsx
// routes.tsx — createBrowserRouter com 36 rotas
// IMPORTANTE: importar de 'react-router', NÃO 'react-router-dom'
import { createBrowserRouter, Navigate } from 'react-router';
```

### 4.2 Sidebar com RBAC

```tsx
// MainLayout.tsx — Sidebar com 8 seções + 36 itens
// Cada item tem roles permitidos
const menuItems = [
  {
    section: 'DASHBOARD',
    items: [
      { label: 'Visão Geral', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'gerencia'] },
      // ...
    ]
  },
  // ... 8 seções
];

// Filtragem por role
const canAccess = (roles: string[]) => roles.includes(user?.role ?? '');
```

---

## 5. FUNCIONALIDADES ESPECIAIS

### 5.1 Operações em Lote (GestaoParcelasPage)

```tsx
// Seleção múltipla com checkboxes
const [selecionadas, setSelecionadas] = useState<string[]>([]);

// Ações em lote
const handleQuitarLote = async () => {
  for (const id of selecionadas) {
    await registrarPagamento.mutateAsync({ id, dataPagamento: new Date().toISOString() });
  }
  setSelecionadas([]);
  toast.success(`${selecionadas.length} parcelas quitadas`);
};
```

### 5.2 Detecção de Modo Incógnito

```tsx
// Configurações requerem modo incógnito
const isIncognito = useIncognitoCheck(); // Storage API / FileSystem API
if (!isIncognito) return <BloqueioScreen />;
```

### 5.3 Templates por Gênero

```tsx
// Templates com mensagens M/F
const mensagem = cliente.sexo === 'masculino'
  ? template.mensagemMasculino
  : template.mensagemFeminino;
// "Prezado Sr. {nome}..." ou "Prezada Sra. {nome}..."
```

### 5.4 Painel de Empréstimo (EmprestimoDetailModal)

```tsx
// Modal rico com 3 tabs
// Tab Parcelas: quitar, baixa parcial, editar juros/multa manual, zerar juros
// Tab Cliente: card completo + rede indicações (useIndicados)
// Tab Empréstimo: progresso, quitar tudo, inadimplente, reativar

// Live data — contadores calculados da query, não do prop estático
const parcelasPagasCount = parcelas?.filter(p => p.status === 'paga').length ?? 0;

// Reativação — dialog ao quitar última parcela
if (pendentesCount === 0) setShowReativarDialog(true);
```

### 5.5 WhatsApp Bot Auto-Reply

```tsx
// webhook-whatsapp: detecta "score" / "meu score" / "status" / "meu status"
// Busca cliente por telefone → responde com dados formatados
// metadata.auto_reply = true no log
```

### 5.6 Monitoramento de Equipe

```tsx
// useActivityTracker() — hook side-effect
// Inicia sessão, heartbeat 60s, Visibility API, registra páginas
// Tabs: Visão Geral | Por Hora | Ranking | Comparativo (radar)
```

---

## 6. VALIDAÇÕES E FORMATAÇÃO

```tsx
// Moeda (BRL)
const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Data
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
format(new Date(), 'dd/MM/yyyy', { locale: ptBR });

// CPF
const formatCPF = (cpf: string) =>
  cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

// Horas (minutos → formato legível)
const formatHoras = (minutos: number) => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h ${m.toString().padStart(2, '0')}min`;
};
```

---

## 7. FEEDBACK AO USUÁRIO

```tsx
// Toasts — Sonner
import { toast } from 'sonner';
toast.success('Operação realizada com sucesso');
toast.error('Erro ao processar');
toast.info('Informação');

// Loading — usar isLoading do React Query
const { data, isLoading } = useClientes();
if (isLoading) return <Loader />;

// Mutations — usar isPending
<Button disabled={createMutation.isPending}>
  {createMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</> : 'Confirmar'}
</Button>

// Empty states
{items.length === 0 && (
  <div className="text-center py-12 text-muted-foreground">
    <Icon className="w-12 h-12 mx-auto mb-4 opacity-50" />
    <p>Nenhum item encontrado</p>
  </div>
)}
```

---

## 8. SEGURANÇA

```tsx
// 1. Supabase Auth com JWT (ES256)
// 2. RLS em todas as tabelas PostgreSQL
// 3. Edge Functions com service_role para ops admin
// 4. --no-verify-jwt obrigatório no deploy (ES256 vs HS256)
// 5. Configurações só em modo incógnito
// 6. RBAC via canAccess() no sidebar + ProtectedRoute
// 7. Admin não pode se auto-remover ou rebaixar

// ProtectedRoute.tsx
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" />;
  return children;
}
```

---

## 9. PERFORMANCE

```tsx
// 1. Vite 6 com tree-shaking automático
// 2. @tailwindcss/vite plugin (sem PostCSS overhead)
// 3. Imports individuais de Lucide icons
// 4. React Query — cache + staleTime (evita refetches desnecessários)
// 5. useMemo/useCallback em computações custosas
// 6. Supabase Realtime para WebSocket (não polling)

// Bundle atual (v6.0):
// ~2.610 módulos compilados | 0 erros | 0 mocks
```

---

## 10. EDGE FUNCTIONS — PADRÕES

```typescript
// Toda Edge Function segue este padrão:
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req: Request) => {
  // 1. CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // 2. Auth check (exceto webhook-whatsapp)
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  const { data: { user } } = await adminClient.auth.getUser(jwt!);
  if (!user) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });

  // 3. Role check
  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403, headers: corsHeaders });

  // 4. Business logic + response
  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
```

**Deploy:** SEMPRE com `--no-verify-jwt`:
```bash
supabase functions deploy nome-da-funcao --no-verify-jwt
```

---

## 11. CONVENÇÕES DE COMMIT

```
feat: Nova funcionalidade
fix: Correção de bug
docs: Documentação
style: Formatação (sem alterar lógica)
refactor: Refatoração
chore: Manutenção
perf: Performance
```

---

## 12. CHECKLIST PARA NOVAS PÁGINAS

1. Criar service em `services/dominioService.ts`
2. Criar hook em `hooks/useDominio.ts` (React Query)
3. Criar página em `pages/NomeDaPaginaPage.tsx`
4. Adicionar rota em `routes.tsx`
5. Adicionar item no sidebar em `MainLayout.tsx` (com roles)
6. Adicionar view type em `lib/view-types.ts` (se necessário)
7. Adicionar adapter em `lib/adapters.ts` (se necessário)
8. Testar dark mode em ambos os temas
9. Adicionar documentação na `DOCUMENTACAO.md`
