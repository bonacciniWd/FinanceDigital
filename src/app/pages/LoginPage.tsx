/**
 * @module LoginPage
 * @description Página de autenticação do FintechFlow.
 *
 * Exibe formulário de login com e-mail e senha, validação básica
 * e autenticação via contexto {@link AuthContext}.
 * Após login bem-sucedido redireciona para `/dashboard`.
 *
 * @route /login
 * @access Público (única rota não protegida)
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Mail, Lock, Eye, EyeOff, Sun, Moon, Download, BookOpen } from 'lucide-react';

import logo from '../assets/logo-login.png';
import { useTheme } from '../contexts/ThemeContext';
import { AnimatedBackground } from '../components/AnimatedBackground';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  // Mostra erro de IP bloqueado vindo do ProtectedRoute
  useEffect(() => {
    const ipError = (location.state as any)?.ipError;
    if (ipError) setError(ipError);
  }, [location.state]);

  // Se já está autenticado, redireciona direto
  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.error ?? 'Usuário ou senha inválidos');
      }
    } catch (err) {
      setError('Erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 transition-colors duration-300 relative">
      <AnimatedBackground />
      {/* Top-right actions */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
        <Link
          to="/download"
          className="p-2 rounded-full glass hover:bg-white/20 dark:hover:bg-white/10 text-foreground transition-colors"
          title="Download do App"
        >
          <Download className="w-5 h-5" />
        </Link>
        <Link
          to="/docs"
          className="p-2 rounded-full glass hover:bg-white/20 dark:hover:bg-white/10 text-foreground transition-colors"
          title="Documentação & FAQ"
        >
          <BookOpen className="w-5 h-5" />
        </Link>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full glass hover:bg-white/20 dark:hover:bg-white/10 text-foreground transition-colors"
          title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      <Card className="w-full max-w-xl shadow-2xl relative z-10">
        <CardHeader className="space-y-4 text-center">
          {/* Logo */}
        <div className="p-5 border-b border-sidebar-border/50 flex items-center justify-between">
          <div className="mx-auto items-center">
            <span className="animated-logo ml-2 flex flex-col leading-tight"><span className="font-bold">FINTECH</span></span>
          </div>
        </div>
          <div>
            <CardDescription className="mt-2">
              Plataforma de Gestão de Crédito
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full liquid-metal-btn-active text-primary-foreground hover:brightness-110 border-0"
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>

            <div className="text-center">
              <a
                href="#"
                className="text-sm text-muted-foreground hover:underline"
              >
                Esqueceu a senha?
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
