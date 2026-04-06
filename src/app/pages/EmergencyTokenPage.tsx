/**
 * @module EmergencyTokenPage
 * @description Rota secreta para resgatar token de emergência e registrar IP na whitelist.
 * @route /emergency
 * @access Público — validada por token
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2, CheckCircle2, XCircle, Key } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function EmergencyTokenPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [ip, setIp] = useState('');

  // Auto-submit if token came from URL
  useEffect(() => {
    if (tokenFromUrl) {
      handleRedeem(tokenFromUrl);
    }
  }, []);

  const handleRedeem = async (t?: string) => {
    const useToken = (t || token).trim();
    if (!useToken) return;

    setStatus('loading');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(
        `${supabaseUrl}/functions/v1/check-ip/redeem`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ token: useToken, label: label || undefined }),
        }
      );

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus('success');
        setIp(data.ip);
        setMessage(`IP ${data.ip} adicionado à whitelist com sucesso!`);
      } else {
        setStatus('error');
        setMessage(data.error || 'Token inválido, expirado ou já utilizado.');
      }
    } catch {
      setStatus('error');
      setMessage('Erro de conexão. Tente novamente.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
      <Card className="max-w-md w-full bg-white/5 border-white/10">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <Key className="w-10 h-10 mx-auto text-indigo-400" />
            <h1 className="text-2xl font-bold text-white">Registrar IP de Emergência</h1>
            <p className="text-slate-400 text-sm">
              Insira o token fornecido pelo administrador para liberar seu IP atual.
            </p>
          </div>

          {status === 'success' ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-400" />
              <p className="text-green-400 font-medium">{message}</p>
              <p className="text-slate-400 text-sm">Você já pode abrir o aplicativo desktop.</p>
            </div>
          ) : status === 'error' ? (
            <div className="space-y-4">
              <div className="text-center py-4">
                <XCircle className="w-12 h-12 mx-auto text-red-400 mb-2" />
                <p className="text-red-400 font-medium">{message}</p>
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => { setStatus('idle'); setToken(''); }}
              >
                Tentar Novamente
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300">Token de Emergência</Label>
                <Input
                  placeholder="Cole o token aqui..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="bg-white/5 border-white/20 text-white font-mono"
                />
              </div>
              <div>
                <Label className="text-slate-300">Identificação (opcional)</Label>
                <Input
                  placeholder="Ex: Home Office - João"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="bg-white/5 border-white/20 text-white"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => handleRedeem()}
                disabled={!token.trim() || status === 'loading'}
              >
                {status === 'loading' ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Key className="w-4 h-4 mr-2" />
                )}
                Registrar Meu IP
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
