/**
 * RootNavigator — Login ↔ App (Bottom Tabs + tela "Mais").
 *
 * Sem Drawer (que requer reanimated/worklets — instável no Expo Go).
 * 4 abas principais + tela "Mais" com lista navegável das telas restantes.
 */
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { CobrancaScreen } from '../screens/CobrancaScreen';
import { ClientesScreen } from '../screens/ClientesScreen';
import { DashboardFinanceiroScreen } from '../screens/DashboardFinanceiroScreen';
import { DashboardComercialScreen } from '../screens/DashboardComercialScreen';
import { DashboardCobrancaScreen } from '../screens/DashboardCobrancaScreen';
import { AnaliseCreditoScreen } from '../screens/AnaliseCreditoScreen';
import { KanbanCobrancaScreen } from '../screens/KanbanCobrancaScreen';
import { RedeIndicacoesScreen } from '../screens/RedeIndicacoesScreen';
import { BonusComissoesScreen } from '../screens/BonusComissoesScreen';
import { RelatoriosScreen } from '../screens/RelatoriosScreen';
import { PerfisAcessoScreen } from '../screens/PerfisAcessoScreen';
import { ProdutividadeScreen } from '../screens/ProdutividadeScreen';
import { SaidasOrfasScreen } from '../screens/SaidasOrfasScreen';
import { PagamentosWooviScreen } from '../screens/PagamentosWooviScreen';
import { colors, fontSizes, spacing, radii } from '../theme/tokens';
import { ScreenLoading } from '../components/ui/State';

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
    notification: colors.primary,
  },
};

type ExtraScreen = {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  Component: React.ComponentType;
};

const EXTRA_SCREENS: ExtraScreen[] = [
  { name: 'Dashboard Financeiro', icon: 'wallet-outline', Component: DashboardFinanceiroScreen },
  { name: 'Dashboard Comercial', icon: 'trending-up-outline', Component: DashboardComercialScreen },
  { name: 'Dashboard Cobrança', icon: 'bar-chart-outline', Component: DashboardCobrancaScreen },
  { name: 'Análise de Crédito', icon: 'document-text-outline', Component: AnaliseCreditoScreen },
  { name: 'Kanban Cobrança', icon: 'grid-outline', Component: KanbanCobrancaScreen },
  { name: 'Rede de Indicações', icon: 'git-network-outline', Component: RedeIndicacoesScreen },
  { name: 'Bônus & Comissões', icon: 'gift-outline', Component: BonusComissoesScreen },
  { name: 'Relatórios', icon: 'document-outline', Component: RelatoriosScreen },
  { name: 'Perfis de Acesso', icon: 'key-outline', Component: PerfisAcessoScreen },
  { name: 'Produtividade', icon: 'speedometer-outline', Component: ProdutividadeScreen },
  { name: 'Saídas Órfãs', icon: 'alert-circle-outline', Component: SaidasOrfasScreen },
  { name: 'Pagamentos Woovi', icon: 'card-outline', Component: PagamentosWooviScreen },
];

const MoreStack = createNativeStackNavigator();

function MoreScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.profile}>
        <Text style={styles.profileName} numberOfLines={1}>
          {user?.name || user?.email}
        </Text>
        <Text style={styles.profileRole}>Administrador</Text>
      </View>

      {EXTRA_SCREENS.map((s) => (
        <Pressable
          key={s.name}
          onPress={() => navigation.navigate(s.name)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Ionicons name={s.icon} size={20} color={colors.textMuted} />
          <Text style={styles.rowText}>{s.name}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </Pressable>
      ))}

      <Pressable
        onPress={signOut}
        style={({ pressed }) => [styles.row, styles.rowDanger, pressed && styles.rowPressed]}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={[styles.rowText, { color: colors.danger }]}>Sair</Text>
      </Pressable>
    </ScrollView>
  );
}

function MoreNavigator() {
  return (
    <MoreStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <MoreStack.Screen name="Menu" component={MoreScreen} options={{ title: 'Mais' }} />
      {EXTRA_SCREENS.map((s) => (
        <MoreStack.Screen key={s.name} name={s.name} component={s.Component} />
      ))}
    </MoreStack.Navigator>
  );
}

const Tab = createBottomTabNavigator();

function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: 'home-outline',
            Cobrança: 'cash-outline',
            Clientes: 'people-outline',
            Mais: 'menu-outline',
          };
          return <Ionicons name={map[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Cobrança" component={CobrancaScreen} />
      <Tab.Screen name="Clientes" component={ClientesScreen} />
      <Tab.Screen name="Mais" component={MoreNavigator} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

const RootStack = createNativeStackNavigator();

export function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <ScreenLoading label="Inicializando…" />;

  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <RootStack.Screen name="App" component={AdminTabs} />
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: spacing.md, gap: spacing.xs },
  profile: {
    backgroundColor: colors.bgElevated,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileName: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  profileRole: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { opacity: 0.7 },
  rowText: { flex: 1, color: colors.text, fontSize: fontSizes.sm, fontWeight: '600' },
  rowDanger: { marginTop: spacing.md },
});
