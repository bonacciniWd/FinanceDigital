# Fintechflow Admin (mobile)

App React Native (Expo) restrito ao perfil **admin** do FintechFlow.

## Setup

```bash
# Na raiz do monorepo
pnpm install

# Configure .env do app mobile
cp apps/mobile/.env.example apps/mobile/.env
# edite apps/mobile/.env com URL e ANON_KEY do Supabase
```

## Rodar em dev

```bash
cd apps/mobile
pnpm start            # abre Metro + QR code
pnpm ios              # iOS Simulator (precisa Xcode)
pnpm android          # Android Emulator (precisa Android Studio)
```

Em dispositivo físico, instale o app **Expo Go** e escaneie o QR code.

## Stack

- **Expo SDK 51** (managed workflow)
- **React Navigation** v6 (Drawer + Stack nativo)
- **@tanstack/react-query** v5 (cache de queries)
- **@supabase/supabase-js** v2 + AsyncStorage para persistência de sessão
- **@expo/vector-icons** (Ionicons)
- StyleSheet nativo (sem Tailwind/NativeWind nesta primeira iteração)

## Estrutura

```
apps/mobile/
  App.tsx                       # Providers (Query, Auth, Safe area, Gesture)
  index.ts                      # Entry point
  app.json                      # Config Expo
  metro.config.js               # Resolver pnpm workspace
  src/
    contexts/AuthContext.tsx    # Sessão Supabase + role-guard admin
    lib/
      supabase.ts               # Client (AsyncStorage + EXPO_PUBLIC_*)
      queryClient.ts            # React Query config
      format.ts                 # BRL, datas, etc.
    theme/tokens.ts             # Cores, spacing, fontSizes
    components/ui/              # Card, Button, Badge, StatCard, State
    navigation/RootNavigator.tsx
    screens/
      LoginScreen.tsx           # ✅ funcional
      DashboardScreen.tsx       # ✅ funcional (KPIs reais)
      CobrancaScreen.tsx        # ✅ funcional (lista parcelas)
      ClientesScreen.tsx        # ✅ funcional (busca + paginação infinita)
      Placeholders.tsx          # 🚧 telas restantes (em construção)
```

## Status das telas

| Tela | Status |
|---|---|
| Dashboard | ✅ Funcional |
| Cobrança | ✅ Funcional (lista, sem kanban DnD) |
| Clientes | ✅ Funcional (busca, paginação infinita) |
| Dashboard Financeiro | 🚧 Stub |
| Dashboard Comercial | 🚧 Stub |
| Dashboard Cobrança | 🚧 Stub |
| Análise de Crédito | 🚧 Stub |
| Kanban Cobrança | 🚧 Stub |
| Rede de Indicações | 🚧 Stub |
| Bônus & Comissões | 🚧 Stub |
| Relatórios | 🚧 Stub |
| Perfis de Acesso | 🚧 Stub |
| Produtividade | 🚧 Stub |
| Saídas Órfãs | 🚧 Stub |
| Pagamentos Woovi | 🚧 Stub |

## Auth & permissões

- O login usa Supabase Auth (mesma base do web).
- Após autenticar, o app consulta `profiles.role`. Se não for `admin`, faz signOut imediato e mostra erro.
- Não há checagem de IP whitelist no mobile (decisão do produto).

## Build & distribuição

Para gerar binários (`.ipa`/`.apk`), use **EAS Build**:

```bash
pnpm dlx eas-cli build --platform ios
pnpm dlx eas-cli build --platform android
```

## Roadmap

- [ ] Implementar telas marcadas como Stub (priorizar dashboards financeiro/cobrança)
- [ ] Push notifications (Expo Notifications) para alerta de inadimplência
- [ ] Modal de detalhes de cliente (espelhando ClienteDetalhesModal)
- [ ] Kanban com swipe lateral entre colunas (substitui DnD)
- [ ] Suporte a biometria/PIN local para reabrir sessão
