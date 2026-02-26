📘 GUIDELINES.MD

Diretrizes de Desenvolvimento - FintechFlow

> **Última atualização**: 23/02/2026  
> **Stack**: React 18 + TypeScript + Vite 6 + Tailwind CSS v4 + Radix UI (shadcn/ui)

---

## 1. PADRÕES DE CÓDIGO

### 1.1 Estrutura de Componentes React (Functional Components + Hooks)

```tsx
/**
 * Nomenclatura: PascalCase para componentes
 * Ex: ClientCard.tsx, LoanTable.tsx
 * Páginas: NomeDaPaginaPage.tsx
 */

// IMPORTS (ordem: react → terceiros → componentes → lib → tipos)
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Search, Plus, Filter } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mockClientes, type Cliente } from '../lib/mockData';

// PROPS (com interface TypeScript)
interface ClientCardProps {
  cliente: Cliente;
  showDetails?: boolean;
  onUpdate?: (cliente: Cliente) => void;
  onClose?: () => void;
}

export default function ClientCard({ cliente, showDetails = false, onUpdate, onClose }: ClientCardProps) {
  // HOOKS (contextos e navegação)
  const { user } = useAuth();
  const navigate = useNavigate();

  // STATE LOCAL
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // COMPUTED (useMemo)
  const canEdit = useMemo(() => {
    return user?.role === 'admin' || user?.role === 'gerencia';
  }, [user]);

  // EFFECTS
  useEffect(() => {
    if (cliente.id) loadDetails(cliente.id);
  }, [cliente.id]);

  // HANDLERS
  const loadDetails = async (id: string) => {
    setLoading(true);
    try {
      // fetch logic
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!canEdit) return;
    onUpdate?.(cliente);
    toast.success('Cliente atualizado');
  };

  // RENDER
  return (
    <Card>
      <CardContent>
        {/* JSX */}
      </CardContent>
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
│   └── 📁 ui/                # ~40 shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── select.tsx
│       ├── tabs.tsx
│       └── ...
├── 📁 contexts/
│   └── AuthContext.tsx         # Autenticação (useAuth hook)
├── 📁 lib/
│   └── mockData.ts            # Interfaces + dados mock centralizados
├── 📁 pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── ClientesPage.tsx
│   ├── GestaoParcelasPage.tsx # Operações em lote
│   └── ...                    # 31 páginas no total
├── routes.tsx                 # React Router 7 (28 rotas)
└── App.tsx                    # Root component
```

### 1.3 Padrões de Página

```tsx
// Estrutura padrão de uma página
export default function NomeDaPaginaPage() {
  // 1. Hooks
  // 2. State
  // 3. Computed/Memo
  // 4. Effects
  // 5. Handlers
  // 6. Render helpers (funções que retornam JSX)
  // 7. Return principal

  return (
    <div className="space-y-6">
      {/* Header com título + ações */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Título</h1>
          <p className="text-muted-foreground mt-1">Descrição</p>
        </div>
        <Button><Plus className="w-4 h-4 mr-2" /> Ação</Button>
      </div>

      {/* KPIs (quando relevante) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>...</Card>
      </div>

      {/* Conteúdo principal */}
      <Card>
        <CardContent>...</CardContent>
      </Card>
    </div>
  );
}
```

---

## 2. ESTILOS E UI

### 2.1 Tailwind CSS v4 + shadcn/ui

```tsx
// Cards padronizados — usar shadcn/ui Card
<Card>
  <CardHeader>
    <CardTitle className="text-base">Título</CardTitle>
  </CardHeader>
  <CardContent>
    {/* conteúdo */}
  </CardContent>
</Card>

// Botões — usar shadcn/ui Button
<Button>Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="destructive">Danger</Button>
<Button variant="ghost" size="icon"><X className="w-4 h-4" /></Button>

// Badges de status — usar shadcn/ui Badge
<Badge>Default</Badge>
<Badge variant="secondary">Secundário</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="destructive">Erro</Badge>
<Badge className="bg-green-100 text-green-800">Custom</Badge>

// Tabelas — HTML table com classes Tailwind
<table className="w-full">
  <thead>
    <tr className="border-b bg-muted/50">
      <th className="text-left p-3 text-sm font-semibold">Coluna</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b hover:bg-muted/30">
      <td className="p-3 text-sm">Valor</td>
    </tr>
  </tbody>
</table>

// Formulários — usar shadcn/ui Input + Label
<div>
  <label className="text-sm font-medium mb-1.5 block">Nome</label>
  <Input value={nome} onChange={e => setNome(e.target.value)} />
</div>

// Diálogos — usar shadcn/ui Dialog
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Título</DialogTitle>
    </DialogHeader>
    {/* conteúdo */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      <Button onClick={handleSubmit}>Confirmar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 2.2 Paleta de Cores do Tema

```css
/* Definido em styles/theme.css — usado via classes Tailwind */
/* Cores primárias da plataforma */
--primary: #0A2472;      /* Azul Marinho - confiança */
--secondary: #2EC4B6;    /* Verde Água - sucesso/destaques */
--accent: #FCA311;       /* Laranja - alertas */
--destructive: #E71D36;  /* Vermelho - inadimplência */

/* Cores semânticas para status */
.bg-green-100 .text-green-800  /* Em dia */
.bg-yellow-100 .text-yellow-800 /* À vencer */
.bg-red-100 .text-red-800      /* Vencido */
.bg-blue-100 .text-blue-800    /* Em análise */
.bg-purple-100 .text-purple-800 /* Em negociação */
```

### 2.3 Ícones

Usar **Lucide React** exclusivamente. Importar individualmente:

```tsx
import { Search, Plus, Edit, Trash2, Download, Clock, Users } from 'lucide-react';

// Tamanhos padrão
<Icon className="w-4 h-4" />   // inline em botões/badges
<Icon className="w-5 h-5" />   // header/toolbar
<Icon className="w-8 h-8" />   // cards de KPI
```

---

## 3. GERENCIAMENTO DE ESTADO

### 3.1 React Context + useState (abordagem atual)

```tsx
// contexts/AuthContext.tsx — Autenticação
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User { name: string; email: string; role: string; }
interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

### 3.2 Dados Mock (mockData.ts)

Todas as interfaces e dados mock ficam centralizados em `src/app/lib/mockData.ts`:

```tsx
// Interfaces principais
export interface Cliente {
  id: string;
  nome: string;
  cpf: string;
  sexo: 'masculino' | 'feminino';  // Para mensagens por gênero
  email: string;
  telefone: string;
  status: 'em_dia' | 'atrasado' | 'inadimplente' | 'negociando';
  score: number;
  limiteCredito: number;
  saldoDevedor: number;
}

export interface Funcionario {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  status: 'online' | 'ausente' | 'offline';
  horasHoje: number;    // em minutos
  horasSemana: number;
  horasMes: number;
  atividadesHoje: number;
  metaDiaria: number;
  sessoes: SessaoAtividade[];
}

export interface TemplateWhatsApp {
  id: string;
  nome: string;
  categoria: string;
  mensagemMasculino: string;   // "Prezado Sr. {nome}..."
  mensagemFeminino: string;    // "Prezada Sra. {nome}..."
  variaveis: string[];
  ativo: boolean;
}
```

---

## 4. ROTAS E NAVEGAÇÃO

### 4.1 React Router 7

```tsx
// routes.tsx — createBrowserRouter com 28 rotas
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/cliente', element: <ProtectedRoute><ClienteAreaPage /></ProtectedRoute> },
  {
    path: '/',
    element: <ProtectedRoute><MainLayout /></ProtectedRoute>,
    children: [
      // Dashboard (4)
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'dashboard/financeiro', element: <DashboardFinanceiroPage /> },
      { path: 'dashboard/cobranca', element: <DashboardCobrancaPage /> },
      { path: 'dashboard/comercial', element: <DashboardComercialPage /> },
      // Clientes (5)
      { path: 'clientes', element: <ClientesPage /> },
      { path: 'clientes/analise', element: <AnaliseCreditoPage /> },
      // ... etc
    ],
  },
]);
```

### 4.2 Sidebar com RBAC

```tsx
// MainLayout.tsx — 8 seções de navegação
const navigation = [
  { title: 'DASHBOARD', items: [...] },
  { title: 'CLIENTES', items: [...] },
  { title: 'REDE DE INDICAÇÕES', items: [...] },
  { title: 'COMUNICAÇÃO', items: [...] },
  { title: 'KANBAN', items: [...] },
  { title: 'RELATÓRIOS', items: [...] },
  { title: 'CONFIGURAÇÕES', items: [...] },
  { title: 'EQUIPE', items: [...] },
];

// Cada item tem: name, href, icon, roles[]
// canAccess() filtra por user.role
```

---

## 5. FUNCIONALIDADES ESPECIAIS

### 5.1 Operações em Lote (GestaoParcelasPage)

```tsx
// Seleção com checkboxes
const [selecionadas, setSelecionadas] = useState<string[]>([]);

// 3 operações disponíveis:
// 1. Quitar em lote — Dialog com desconto opcional
// 2. Editar série — Alterar valor e/ou dia de vencimento
// 3. Excluir em lote — Confirmação com contagem
```

### 5.2 Detecção de Modo Incógnito (Configurações)

```tsx
// Usado em PerfisAcessoPage, IntegracoesPage, MinhaContaPage
function useIncognitoCheck() {
  const [isIncognito, setIsIncognito] = useState<boolean | null>(null);
  useEffect(() => {
    async function check() {
      // Método 1: StorageManager quota (Chrome: <200MB = incógnito)
      // Método 2: webkitRequestFileSystem API
      // Fallback: consider não-incógnito (seguro)
    }
    check();
  }, []);
  return isIncognito;
}

// Se não incógnito → exibe IncognitoBlockScreen com instruções
```

### 5.3 Templates por Gênero (WhatsApp)

```tsx
// TemplatesMensagensPage — Preview com toggle
<Button onClick={() => setGenero('masculino')}>Masculino</Button>
<Button onClick={() => setGenero('feminino')}>Feminino</Button>

// Template dinâmico
const mensagem = genero === 'masculino' 
  ? template.mensagemMasculino 
  : template.mensagemFeminino;
```

### 5.4 Monitoramento de Equipe

```tsx
// MonitoramentoAtividadePage — dados de mockFuncionarios
// Tabs: Equipe (cards) | Sessões de Hoje (tabela) | Alertas
// Cada card mostra: horasHoje, horasSemana, horasMes, progresso meta

// ProdutividadePage — gráficos de performance
// Tabs: Visão Geral (bar) | Por Hora (bar) | Ranking (list) | Comparativo (radar)
```

---

## 6. VALIDAÇÕES E FORMATAÇÃO

```tsx
// Formatação de moeda
const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Formatação de data
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
// Toasts — usar Sonner
import { toast } from 'sonner';

toast.success('Operação realizada com sucesso');
toast.error('Erro ao processar');
toast.info('Informação');

// Loading states
const [loading, setLoading] = useState(false);

<Button disabled={loading}>
  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</> : 'Confirmar'}
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
// 1. Configurações só em modo incógnito (useIncognitoCheck)
// 2. RBAC via canAccess() no sidebar
// 3. ProtectedRoute guard para rotas autenticadas
// 4. Futuro: RLS no Supabase + JWT validation

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
// 1. Build otimizado pelo Vite (tree-shaking automático)
// 2. Imports individuais de Lucide icons (não importar tudo)
// 3. useMemo/useCallback quando necessário
// 4. Futuro: React.lazy para code-splitting por rota

// Bundle atual (gzip):
// JS: ~296 KB | CSS: ~17 KB | 2.357 módulos
```

---

## 10. CONVENÇÕES DE COMMIT

```
feat: Nova funcionalidade
fix: Correção de bug
docs: Documentação
style: Formatação (sem alterar lógica)
refactor: Refatoração
chore: Manutenção
```
