/**
 * @module GruposBloqueadosPage
 * @description Gestão de grupos e indicadores bloqueados.
 *
 * Lista indicadores bloqueados por fraude, inadimplência ou
 * violação de termos. Permite desbloquear, enviar notificação
 * ou excluir permanentemente da rede.
 *
 * @route /rede/grupos-bloqueados
 * @access Protegido — perfis admin, gerente
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { AlertTriangle, Ban, MessageSquare, Unlock } from 'lucide-react';

import { StatusBadge } from '../components/StatusBadge';

interface GrupoBloqueado {
  id: string;
  nome: string;
  lider: string;
  membros: string[];
  motivoBloqueio: string;
  clienteInadimplente: string;
  valorDevido: number;
  diasBloqueio: number;
  dataBloqueio: string;
}

const mockGruposBloqueados: GrupoBloqueado[] = [
  {
    id: 'g1',
    nome: 'Rede João Silva',
    lider: 'João Silva',
    membros: ['Pedro Oliveira', 'Ana Costa', 'Carlos Souza'],
    motivoBloqueio: 'Inadimplência de membro da rede',
    clienteInadimplente: 'Ana Costa',
    valorDevido: 2500,
    diasBloqueio: 76,
    dataBloqueio: '2026-04-05',
  },
  {
    id: 'g2',
    nome: 'Rede Maria Santos',
    lider: 'Maria Santos',
    membros: ['João Silva', 'Pedro Oliveira'],
    motivoBloqueio: 'Líder inadimplente',
    clienteInadimplente: 'Maria Santos',
    valorDevido: 3200,
    diasBloqueio: 45,
    dataBloqueio: '2026-05-01',
  },
];

export default function GruposBloqueadosPage() {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Grupos Bloqueados</h1>
        <p className="text-muted-foreground mt-1">Redes com bloqueio solidário por inadimplência</p>
      </div>

      <Alert className="border-red-500 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          <strong>{mockGruposBloqueados.length} rede(s)</strong> com bloqueio solidário ativo. 
          Total de membros afetados: <strong>{mockGruposBloqueados.reduce((acc, g) => acc + g.membros.length + 1, 0)}</strong>
        </AlertDescription>
      </Alert>

      {/* Cards métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Redes Bloqueadas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{mockGruposBloqueados.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Valor Total Devido</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(mockGruposBloqueados.reduce((acc, g) => acc + g.valorDevido, 0))}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Média Dias Bloqueio</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{Math.round(mockGruposBloqueados.reduce((acc, g) => acc + g.diasBloqueio, 0) / mockGruposBloqueados.length)} dias</div></CardContent>
        </Card>
      </div>

      {/* Lista de Grupos */}
      <div className="space-y-6">
        {mockGruposBloqueados.map((grupo) => (
          <Card key={grupo.id} className="border-red-200 border-2">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <Ban className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <CardTitle>{grupo.nome}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">Bloqueado há {grupo.diasBloqueio} dias</p>
                  </div>
                </div>
                <Badge className="bg-red-100 text-red-800">BLOQUEADO</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-sm font-medium text-red-800">Motivo: {grupo.motivoBloqueio}</p>
                <p className="text-sm text-red-700 mt-1">Inadimplente: <strong>{grupo.clienteInadimplente}</strong></p>
                <p className="text-sm text-red-700">Valor devido: <strong>{formatCurrency(grupo.valorDevido)}</strong></p>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3">Membros Afetados</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full mx-auto flex items-center justify-center font-semibold text-sm mb-1">
                      {grupo.lider.charAt(0)}
                    </div>
                    <div className="text-sm font-medium">{grupo.lider}</div>
                    <Badge className="bg-blue-100 text-blue-800 text-xs mt-1">Líder</Badge>
                  </div>
                  {grupo.membros.map((membro, i) => (
                    <div key={i} className={`p-3 rounded-lg text-center ${membro === grupo.clienteInadimplente ? 'bg-red-100' : 'bg-muted'}`}>
                      <div className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center font-semibold text-sm mb-1 ${membro === grupo.clienteInadimplente ? 'bg-red-600 text-white' : 'bg-muted-foreground text-white'}`}>
                        {membro.charAt(0)}
                      </div>
                      <div className="text-sm font-medium">{membro}</div>
                      {membro === grupo.clienteInadimplente && (
                        <Badge className="bg-red-100 text-red-800 text-xs mt-1">Inadimplente</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button className="bg-green-600 hover:bg-green-700">
                  <Unlock className="w-4 h-4 mr-2" />Desbloquear Rede
                </Button>
                <Button variant="outline">
                  <MessageSquare className="w-4 h-4 mr-2" />Contatar Inadimplente
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
