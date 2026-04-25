/**
 * @module DownloadPage
 * @description Página profissional de download do app desktop.
 * Inspirada no layout do Discord e GitHub Desktop — hero com gradiente,
 * detecção automática de OS, cards por plataforma, changelog resumido.
 * Protegida por IP whitelist via Vercel middleware.
 * @route /download
 * @access Público mas protegido por IP — middleware retorna 404 para IPs não autorizados
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/button';
import {
  Download,
  Monitor,
  Shield,
  Apple,
  Laptop,
  CheckCircle2,
  ArrowDown,
  Sparkles,
  Lock,
  Zap,
  Globe,
  Cpu,
  Cloud,
  TrendingUp,
  ChevronRight,
  Star,
  Github,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

import logo from '../assets/logo-download.svg';
import logo2 from '../assets/logo-download2.png';
import appleLogo from '../assets/apple.svg';
import windowsLogo from '../assets/windows.svg';
import linuxLogo from '../assets/linux.svg';
import docIcon from '../assets/doc.svg';

const PLATFORM_LOGOS: Record<string, string> = {
  windows: windowsLogo,
  macos: appleLogo,
  linux: linuxLogo,
};

const APP_VERSION = __APP_VERSION__;
const GITHUB_REPO = 'https://github.com/bonacciniWd/FinanceDigital';
const GITHUB_RELEASE = `${GITHUB_REPO}/releases/download/v${APP_VERSION}`;

const PLATFORMS = [
  {
    id: 'windows',
    os: 'Windows',
    icon: Laptop,
    url: `${GITHUB_RELEASE}/Calculadora-${APP_VERSION}-win-x64.exe`,
    size: '116 MB',
    note: 'Windows 10/11 (64-bit)',
    ext: '.exe',
    color: 'from-blue-500 to-cyan-500',
    bgGlow: 'bg-blue-500/20',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
  },
  {
    id: 'macos',
    os: 'macOS',
    icon: Apple,
    url: `${GITHUB_RELEASE}/Calculadora-${APP_VERSION}-mac-x64.dmg`,
    size: '149 MB',
    note: 'macOS 12+ (Intel & Apple Silicon)',
    ext: '.dmg',
    color: 'from-purple-500 to-pink-500',
    bgGlow: 'bg-purple-500/20',
    gradient: 'linear-gradient(135deg, #a855f7 0%, #ec489a 100%)',
  },
  {
    id: 'linux',
    os: 'Linux',
    icon: Monitor,
    url: `${GITHUB_RELEASE}/Calculadora-${APP_VERSION}-linux-x86_64.AppImage`,
    size: '152 MB',
    note: 'Ubuntu / Debian / Fedora (64-bit)',
    ext: '.AppImage',
    color: 'from-orange-500 to-yellow-500',
    bgGlow: 'bg-orange-500/20',
    gradient: 'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
  },
];

const FEATURES = [
  { 
    icon: Lock, 
    title: 'Acesso protegido por IP', 
    desc: 'Só redes autorizadas podem baixar e usar o app',
  },
  { 
    icon: Zap, 
    title: 'Performance nativa', 
    desc: 'Executa direto no desktop sem depender do navegador',
  },
  { 
    icon: Globe, 
    title: 'Sempre atualizado', 
    desc: 'Conecta diretamente ao servidor em nuvem',
  },
  { 
    icon: Cpu, 
    title: 'Otimizado para desktop', 
    desc: 'Interface adaptada para telas grandes e produtividade',
  },
  { 
    icon: Cloud, 
    title: 'Sincronização em tempo real', 
    desc: 'Dados sempre atualizados via Supabase Realtime',
  },
  { 
    icon: TrendingUp, 
    title: 'Análise de crédito avançada', 
    desc: 'Machine learning para aprovação inteligente',
  },
];

const CHANGELOG = [
  { version: '1.4.4', date: '25 Abr 2026', isLatest: true, items: [
    'OCR de comprovantes de pagamento com Tesseract.js (extração de valor, data e remetente)',
    'Conciliação automática de pagamentos órfãos (PIX/Woovi/EFI) com lançamento em parcelas',
    'Tela de Pagamentos Órfãos para revisão e vínculo manual',
    'Acordos formais com entrada %, parcelamento e congelamento das parcelas originais',
    'Refinanciamento de empréstimos diretamente do modal do cliente',
    'Edição inline de valor e vencimento por parcela em Gestão de Parcelas',
    'Análise de Crédito: dados completos no card do Kanban (renda, score, parcela)',
    'Filtro de UI refinado, scroll interno em todos os Kanbans',
    'Skeletons "liquidmetal" no Dashboard, Histórico e Cobranças',
    'Lazy loading do Histórico (20 itens por rolagem)',
    'Página de Perfis de Acesso clicável e customizável por admin',
    'Cobranças → link direto para parcela vinculada',
    'Modal de Negociação disponível em todas as telas que listam inadimplentes',
    'Restauração do ordenador por dias e filtro "A Vencer = hoje" no Kanban Cobrança',
  ]},
  { version: '1.4.2', date: '23 Abr 2026', isLatest: false, items: [
    'Juros automáticos por atraso agora configuráveis em Configurações do Sistema',
    'Parâmetros editáveis: juro fixo (R$/dia), juro percentual (%/dia), limiar e teto de dias',
    'Juros congelam automaticamente para clientes em Kanban Arquivado ou Perdido',
    'Gestão de Parcelas respeita o congelamento ao somar totais',
    'Scroll horizontal do Kanban de Cobrança reescrito: sempre visível na base e sem cobrir cards',
    'Cada coluna do Kanban ganhou scroll vertical próprio (funciona bem com 200+ cards)',
  ]},
  { version: '1.4.1', date: '22 Abr 2026', isLatest: false, items: [
    'Botão "Verificar atualizações" na tela de login (desktop) com versão instalada visível',
    'Mensagens de progresso, erro e "reiniciar para instalar" diretamente no app',
    'IPC updater expõe status e permite instalar manualmente sem esperar auto-check',
  ]},
  { version: '1.4.0', date: '22 Abr 2026', isLatest: false, items: [
    'Valores individuais por parcela — permite cobrar valores diferentes em cada vencimento',
    'Separação entre Valor Solicitado (PIX ao cliente) e Valor a Receber (total de volta)',
    'Checkbox "Pular verificação" auto-aprova a análise com registro de auditoria',
    'Painel de Desembolsos migrado para /pagamentos-woovi com controle admin-only',
    'Card vermelho de aviso para análises aprovadas sem verificação de identidade',
  ]},
  { version: '1.3.0', date: '20 Abr 2026', isLatest: false, items: [
    'Sincronização automática de status entre parcelas, empréstimos e clientes',
    'Dashboard recalculado pela fonte correta de empréstimos ativos e inadimplentes',
    'Desembolso automático agora é opcional e configurável por painel administrativo',
    'Kanban de cobrança ganhou etapa Arquivados para atrasos acima de 365 dias',
    'Scroll horizontal no topo do Kanban e botão manual para arquivar N3',
  ]},
  { version: '1.2.0', date: '20 Abr 2026', isLatest: false, items: [
    'Migração completa PlataPlumo: 1.136 clientes, 5.821 empréstimos, 26.749 parcelas',
    'Admin pode definir instância do sistema direto pelo app (sem programador)',
    'Rate limiting no cron de notificações (40/dia, 3s entre envios)',
    'Guard para não notificar clientes migrados (plataplumo_migrado)',
    'Auto-update: app verifica e atualiza automaticamente ao iniciar',
  ]},
  { version: '1.1.0', date: '17 Abr 2026', isLatest: false, items: [
    'Score dinâmico automático — ajusta por pagamento antecipado/atrasado',
    'Controle de desembolso (admin/gerência) com rastreamento PIX',
    'Renda mensal no cadastro de clientes com formatação R$',
    'CPF auto-formatado na análise de crédito',
    'Auto-preenchimento de score e renda do cliente na análise',
    'Formatação monetária R$ x.xxx,xx em todos os campos de valor',
    'Acordos de renegociação com entrada configurável e parcelas',
    'RPCs tipadas para verificação de pendências',
  ]},
  { version: '1.0.0', date: '11 Abr 2026', isLatest: false, items: [
    'Documentos do cliente (RG/CNH, comprovante) no cadastro',
    'Atribuição de documentos via chat WhatsApp',
    'Verificação de identidade simplificada (vídeo + residência)',
    '24 frases de verificação únicas',
    'Juros automáticos por atraso (< R$1000 = R$100/dia, ≥ R$1000 = 10%/dia)',
    'Rede de Indicações com valores reais dos empréstimos',
    'Auto-refresh de sessão quando aba fica inativa',
    'Modal de cadastro landscape com 2 colunas',
  ]},
  { version: '0.5.0', date: '31 Mar 2026', isLatest: false, items: [
    'Integração EFI Bank completa (cobranças cobv com vencimento)',
    'Geração de QR Code PIX e envio automático via WhatsApp',
    'Sistema de comprovantes de pagamento obrigatórios',
    'Configurações do sistema (mensagens automáticas, multa/juros)',
    'Verificação automática de status PIX pós-envio',
    'Novas variáveis de template: {pixCopiaCola}, {valorNum}, etc.',
  ]},
  { version: '0.4.0', date: '30 Mar 2026', isLatest: false, items: [
    'Mapa do Brasil interativo com zoom, pan e filtro por cidade',
    'Valor e vencimento derivados do empréstimo ativo',
    'Coluna "Parcelas" (pagas/total) na listagem de clientes',
    'Painel lateral de cidades com contagem de clientes',
  ]},
  { version: '0.3.0', date: '30 Mar 2026', isLatest: false, items: [
    'Sistema de alerta de pendências com notificações Realtime',
    'Som de alarme + toast para novas análises de crédito',
    'Endereço detalhado com API IBGE (cidades por UF)',
    'Mapa do Brasil com SVG clicável por estado',
    'Exclusão de parcelas restrita a admin',
  ]},
  { version: '0.2.0', date: '26 Mar 2026', isLatest: false, items: [
    'Campo Profissão no cadastro de clientes',
    'Auto-rejeição por divergência de profissão na verificação',
    'Modal "Efetuar Pagamento" com abas Completo/Parcial',
    'Desconto, observação e conta bancária por parcela',
  ]},
  { version: '0.1.0', date: '23 Mar 2026', isLatest: false, items: [
    'Fix race condition de autenticação + IP check',
    'Electron: IP check no startup, zoom corrigido',
    'ActivityTracker resiliente com timeout de 8s',
    'Sessão restaurada com JWT expirado corrigida',
  ]},
  { version: '0.0.1', date: '23 Mar 2026', isLatest: false, items: [
    'Sistema de IP Whitelist + App Desktop (Electron)',
    'Builds para Windows, macOS e Linux',
    'Verificação de IP no startup do Electron',
    'Login integrado com Supabase Auth',
    'Dashboard em tempo real com métricas',
  ]},
];

function detectOS(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'windows';
}

// Variantes de animação
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1 } }
};

export default function DownloadPage() {
  const [detectedOS, setDetectedOS] = useState('windows');
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    setDetectedOS(detectOS());
  }, []);

  const primaryPlatform = PLATFORMS.find((p) => p.id === detectedOS) ?? PLATFORMS[0];
  const otherPlatforms = PLATFORMS.filter((p) => p.id !== detectedOS);

  const handleDownload = (platform: typeof PLATFORMS[0]) => {
    setDownloaded(platform.id);
    window.open(platform.url, '_blank');
    setTimeout(() => setDownloaded(null), 3000);
  };

  // SVG grid pattern como variável para evitar problemas de escape
  const gridPattern = "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='grid' width='60' height='60' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 60 0 L 0 0 0 60' fill='none' stroke='rgba(255,255,255,0.03)' stroke-width='1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23grid)'/%3E%3C/svg%3E\")";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#0f0f1f] to-[#0a0a1a] text-white overflow-x-hidden relative">
      {/* Animated background grid */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ backgroundImage: gridPattern }}
      />
      
     
      {/* Hero Section */}
      <div className="relative z-10">
        <motion.div 
          initial="initial"
          animate="animate"
          variants={staggerContainer}
          className="max-w-5xl mx-auto px-6 pt-20 pb-24 text-center"
        >
          {/* Badge */}
          <motion.div 
            variants={fadeInUp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] border border-white/[0.12] backdrop-blur-xl mb-8 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <Shield className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-400 font-medium">IP verificado — Acesso autorizado</span>
          </motion.div>

          {/* Logo */}
          <motion.div 
            variants={fadeInUp}
            className="flex justify-center mb-6"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur-2xl opacity-50" />
              <img src={logo} alt="Calculadora" className="relative w-[80vh] h-auto drop-shadow-2xl" />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1 
            variants={fadeInUp}
            className="text-6xl sm:text-7xl font-extrabold tracking-tight mb-4"
          >
            <span className="bg-gradient-to-r from-white via-indigo-200 to-purple-300 bg-clip-text text-transparent">
              Fintech
            </span>
          </motion.h1>
          
          <motion.p 
            variants={fadeInUp}
            className="text-xl text-slate-400 max-w-xl mx-auto mb-8"
          >
            Gestão financeira completa direto no seu desktop.
            <br />
            <span className="text-slate-500">Disponível para Windows, macOS e Linux.</span>
          </motion.p>

          {/* Stats */}
          <motion.div 
            variants={fadeInUp}
            className="flex justify-center gap-8 mb-10"
          >
            {[
              { label: 'Versão', value: APP_VERSION, icon: Star },
              { label: 'Open Source', value: 'GitHub', icon: Github, link: GITHUB_REPO },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="flex items-center gap-1 text-slate-400 text-sm mb-1">
                  <stat.icon className="w-3 h-3" />
                  <span>{stat.label}</span>
                </div>
                {stat.link ? (
                  <a 
                    href={stat.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-white font-semibold hover:text-indigo-400 transition-colors flex items-center gap-1"
                  >
                    {stat.value}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <div className="text-white font-semibold">{stat.value}</div>
                )}
              </div>
            ))}
          </motion.div>

          {/* Primary Download Button */}
          <motion.div 
            variants={fadeInUp}
            className="flex flex-col items-center gap-4 mb-6"
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                size="lg"
                onClick={() => handleDownload(primaryPlatform)}
                className="h-[72px] px-14 text-xl font-bold rounded-2xl border-0 liquid-metal-btn-active text-white backdrop-blur-xl transition-all gap-5 relative overflow-hidden group"
              >
                {/* Liquid glass shine */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-transparent rounded-2xl pointer-events-none" />
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500 rounded-2xl" />
                <img src={PLATFORM_LOGOS[primaryPlatform.id]} alt={primaryPlatform.os} className="relative z-10 w-8 h-8 drop-shadow-lg" />
                <span className="relative z-10">Baixar para {primaryPlatform.os}</span>
                <Download className="w-6 h-6 relative z-10 opacity-70" />
              </Button>
            </motion.div>
            <span className="text-sm text-slate-500">
              Versão {APP_VERSION} · {primaryPlatform.ext} · {primaryPlatform.size}
            </span>

            {/* Docs link */}
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl liquid-metal-btn !border-0 text-slate-400 hover:text-white transition-all text-sm font-medium"
            >
              <img src={docIcon} alt="Docs" className="w-5 h-5" />
              <span>Documentação & FAQ</span>
            </Link>
          </motion.div>

          {/* Download notification */}
          <AnimatePresence>
            {downloaded && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="inline-flex items-center gap-2 text-green-400 text-sm bg-green-400/10 px-4 py-2 rounded-full"
              >
                <CheckCircle2 className="w-4 h-4" />
                Download iniciado! Verifique sua pasta de downloads.
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scroll hint */}
          <motion.div 
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="mt-12"
          >
            <ArrowDown className="w-5 h-5 text-slate-600 mx-auto" />
          </motion.div>
        </motion.div>
      </div>

      {/* Other Platforms */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-center text-sm font-semibold text-slate-500 uppercase tracking-widest mb-8 flex items-center justify-center gap-3">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-white/20" />
            Outras plataformas
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-white/20" />
          </h2>
        </motion.div>
        
        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {otherPlatforms.map((p, idx) => (
            <motion.button
              key={p.id}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleDownload(p)}
              onMouseEnter={() => setHoveredCard(p.id)}
              onMouseLeave={() => setHoveredCard(null)}
              className="group relative flex items-center gap-5 p-6 rounded-2xl liquid-metal-btn backdrop-blur-xl transition-all duration-300 text-left !border-0"
            >
              {/* Liquid glass top reflection */}
              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent rounded-t-2xl pointer-events-none" />
              <div className="relative flex-shrink-0 w-14 h-14 rounded-xl bg-white/[0.06] backdrop-blur-md border border-white/[0.1] flex items-center justify-center transition-transform group-hover:scale-110 duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <img src={PLATFORM_LOGOS[p.id]} alt={p.os} className="w-8 h-8 drop-shadow-md" />
              </div>
              <div className="relative flex-1 min-w-0">
                <div className="font-semibold text-white group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-300 group-hover:bg-clip-text transition-all">
                  {p.os}
                </div>
                <div className="text-sm text-slate-500">{p.note}</div>
              </div>
              <div className="relative flex-shrink-0">
                <motion.div
                  animate={{ x: hoveredCard === p.id ? 5 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Download className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors" />
                </motion.div>
              </div>
            </motion.button>
          ))}
        </div>
        
      </div>
      <div className="min-h-[600px] min-w-[100vw] flex items-center justify-center mt-12 mb-28">  
       <img src={logo2} alt="Calculadora" className="w-[90%] h-auto" /> 
      </div> 

      {/* Features Grid */}
      <div className="relative z-10 border-t border-white/[0.04] bg-white/[0.02]">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-5xl font-bold mb-4">Por que escolher a Calculadora?</h2>
            <p className="text-slate-400">Uma experiência completa para gestão financeira</p>
          </motion.div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-6">
            {FEATURES.map((f, idx) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                whileHover={{ y: -5 }}
                className="group relative h-64 p-6 rounded-2xl liquid-metal-btn !border-0 backdrop-blur-lg hover:bg-[rgba(129,140,248,0.08)] transition-all duration-300"
              >
                {/* Liquid glass reflection */}
                <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.04] to-transparent rounded-t-2xl pointer-events-none" />
                <div className="relative space-y-3">
                  <div className="w-16 h-16 rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/[0.08] flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <f.icon className="w-8 h-8 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                  </div>
                  <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors">{f.title}</h3>
                  <p className="text-base text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Changelog — Horizontal Timeline */}
      <div className="relative z-10 border-t border-white/[0.04]">
        <div className="max-w-full mx-auto py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-center gap-2 mb-10"
          >
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-2xl font-bold text-white">Release Notes</h2>
          </motion.div>

          {/* Horizontal scroll container */}
          <div className="relative">
            {/* Horizontal timeline line */}
            <div className="absolute top-[15px] left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

            <div className="flex ml-3 gap-6 overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-indigo-500/30 scrollbar-track-transparent snap-x snap-mandatory">
              {CHANGELOG.map((release, rIdx) => (
                <motion.div
                  key={release.version}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: rIdx * 0.1 }}
                  className="relative flex-shrink-0 w-[340px] snap-start pt-10"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-6 top-[6px] w-[20px] h-[20px] rounded-full bg-indigo-500/30 border-2 border-indigo-500 flex items-center justify-center z-10">
                    <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  </div>

                  {/* Card */}
                  <div className="liquid-metal-btn !border-0 rounded-2xl p-5 space-y-4 group hover:bg-[rgba(129,140,248,0.06)] transition-all duration-300">
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-sm font-mono font-bold group-hover:bg-indigo-500/30 transition-colors">
                        v{release.version}
                      </span>
                      <span className="text-sm text-slate-500">{release.date}</span>
                      {release.isLatest && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                          Latest
                        </span>
                      )}
                    </div>

                    {/* Items */}
                    <ul className="space-y-2">
                      {release.items.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-slate-400 group-hover:text-slate-300 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4 text-green-500/70 flex-shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Scroll fade edges */}
            <div className="absolute top-10 bottom-0 left-0 w-8 bg-gradient-to-r from-[#0a0a1a] to-transparent pointer-events-none" />
            <div className="absolute top-10 bottom-0 right-0 w-8 bg-gradient-to-l from-[#0a0a1a] to-transparent pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Documentation & FAQ Section */}
      <div className="relative z-10 border-t border-white/[0.04] bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-3xl liquid-metal-btn !border-0 backdrop-blur-xl overflow-hidden"
          >
            {/* Glass top reflection */}
            <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />

            <div className="relative flex flex-col lg:flex-row items-center gap-10 p-10 lg:p-14">
              {/* Left — icon + text */}
              <div className="flex-1 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl liquid-metal-btn-active !border-0 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <img src={docIcon} alt="Documentação" className="w-9 h-9 drop-shadow-md" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-white">Documentação & FAQ</h2>
                    <p className="text-slate-400 text-sm mt-1">Tudo que você precisa saber sobre a Calculadora</p>
                  </div>
                </div>

                <p className="text-slate-400 leading-relaxed text-base max-w-lg">
                  Consulte a documentação completa com 11 categorias cobrindo arquitetura, empréstimos, chat, WhatsApp, Kanban, análise de crédito e muito mais. Perguntas frequentes respondidas de forma clara e objetiva.
                </p>

                <div className="flex flex-wrap gap-3">
                  {['Arquitetura', 'Empréstimos', 'Chat', 'WhatsApp', 'Kanban', 'Crédito'].map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-xs font-medium border border-indigo-500/20"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="px-3 py-1 rounded-full bg-white/[0.05] text-slate-400 text-xs font-medium border border-white/[0.08]">+5 mais</span>
                </div>
              </div>

              {/* Right — CTA */}
              <div className="flex flex-col items-center gap-4 flex-shrink-0">
                <Link
                  to="/docs"
                  className="group relative inline-flex items-center gap-3 h-[64px] px-10 rounded-2xl liquid-metal-btn-active !border-0 text-lg font-bold text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.03] transition-all duration-300"
                >
                  <BookOpen className="w-6 h-6" />
                  Acessar Documentação
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <span className="text-xs text-slate-500">11 categorias · 40+ perguntas respondidas</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-white/[0.04] bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-6 py-10 text-center space-y-4">
          <div className="flex justify-center gap-6 text-sm text-slate-500">
            <Link to="/docs" className="hover:text-indigo-400 transition-colors flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> Documentação
            </Link>
            <a href="#" className="hover:text-indigo-400 transition-colors">Termos de uso</a>
            <a href="#" className="hover:text-indigo-400 transition-colors">Política de privacidade</a>
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors flex items-center gap-1">
              GitHub <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-slate-600">
            Requisitos mínimos: Windows 10+ (64-bit) · macOS 12+ · Ubuntu 20.04+ / Fedora 36+ / Debian 11+
          </p>
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} Calculadora · Seu IP foi verificado e autorizado para download
          </p>
        </div>
      </div>
    </div>
  );
}