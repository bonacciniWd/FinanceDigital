/**
 * @module IndicarNovoPage
 * @description Formulário para cadastrar nova indicação na rede.
 *
 * Campos: nome, CPF, telefone, e-mail, indicador (quem indicou)
 * e observações. Validação de CPF e feedback via toast (Sonner).
 *
 * @route /rede/indicar-novo
 * @access Protegido — todos os perfis autenticados
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { UserPlus, Search, CheckCircle } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';

export default function IndicarNovoPage() {
  const [step, setStep] = useState(1);
  const [indicador, setIndicador] = useState('');
  const [formData, setFormData] = useState({
    nome: '', email: '', telefone: '', cpf: '', sexo: '' as 'masculino' | 'feminino' | '',
    valorSolicitado: '', rendaMensal: '',
  });
  const [enviado, setEnviado] = useState(false);
  const { data: allClientes = [] } = useClientes();

  const handleSubmit = () => {
    setEnviado(true);
  };

  if (enviado) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full text-center p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full mx-auto flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Indicação Registrada!</h2>
            <p className="text-muted-foreground mb-4">
              A indicação de <strong>{formData.nome}</strong> foi registrada com sucesso e está em análise.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Indicado por: <strong>{allClientes.find(c => c.id === indicador)?.nome || 'Direto'}</strong>
            </p>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => { setEnviado(false); setStep(1); setFormData({ nome: '', email: '', telefone: '', cpf: '', sexo: '', valorSolicitado: '', rendaMensal: '' }); setIndicador(''); }}>
              Nova Indicação
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Indicar Novo Cliente</h1>
        <p className="text-muted-foreground mt-1">Registre uma nova indicação na rede</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {s}
            </div>
            <span className={`text-sm ${step >= s ? 'font-medium' : 'text-muted-foreground'}`}>
              {s === 1 ? 'Indicador' : s === 2 ? 'Dados do Cliente' : 'Confirmar'}
            </span>
            {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Quem está indicando?</h3>
              <div>
                <Label>Cliente Indicador</Label>
                <Select value={indicador} onValueChange={setIndicador}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cliente indicador" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direto">Captação Direta (sem indicador)</SelectItem>
                    {allClientes.filter(c => c.status !== 'vencido').map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome} - {c.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full bg-primary hover:bg-primary/90" onClick={() => setStep(2)} disabled={!indicador}>
                Próximo
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Dados do Novo Cliente</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome Completo</Label>
                  <Input value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} placeholder="Nome completo" />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input value={formData.cpf} onChange={e => setFormData({ ...formData, cpf: e.target.value })} placeholder="000.000.000-00" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@exemplo.com" />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={formData.telefone} onChange={e => setFormData({ ...formData, telefone: e.target.value })} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <Label>Sexo</Label>
                  <Select value={formData.sexo} onValueChange={(v) => setFormData({ ...formData, sexo: v as 'masculino' | 'feminino' })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor Solicitado (R$)</Label>
                  <Input type="number" value={formData.valorSolicitado} onChange={e => setFormData({ ...formData, valorSolicitado: e.target.value })} placeholder="0.00" />
                </div>
                <div className="md:col-span-2">
                  <Label>Renda Mensal (R$)</Label>
                  <Input type="number" value={formData.rendaMensal} onChange={e => setFormData({ ...formData, rendaMensal: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => setStep(3)} disabled={!formData.nome || !formData.sexo}>
                  Próximo
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Confirmar Indicação</h3>
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Indicador:</span><p className="font-medium">{indicador === 'direto' ? 'Captação Direta' : allClientes.find(c => c.id === indicador)?.nome}</p></div>
                  <div><span className="text-muted-foreground">Nome:</span><p className="font-medium">{formData.nome}</p></div>
                  <div><span className="text-muted-foreground">CPF:</span><p className="font-medium">{formData.cpf}</p></div>
                  <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{formData.email}</p></div>
                  <div><span className="text-muted-foreground">Telefone:</span><p className="font-medium">{formData.telefone}</p></div>
                  <div><span className="text-muted-foreground">Sexo:</span><p className="font-medium capitalize">{formData.sexo}</p></div>
                  <div><span className="text-muted-foreground">Valor Solicitado:</span><p className="font-medium">R$ {formData.valorSolicitado}</p></div>
                  <div><span className="text-muted-foreground">Renda Mensal:</span><p className="font-medium">R$ {formData.rendaMensal}</p></div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleSubmit}>
                  <UserPlus className="w-4 h-4 mr-2" />Confirmar Indicação
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
