import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';

export function LoginScreen() {
  const { signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      Alert.alert('Atenção', 'Informe e-mail e senha.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      Alert.alert('Falha no login', err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.brand}>
            <Text style={styles.brandTitle}>Fintechflow</Text>
            <Text style={styles.brandSubtitle}>Painel administrativo</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="seu@email.com"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              editable={!loading && !submitting}
            />

            <Text style={[styles.label, { marginTop: spacing.md }]}>Senha</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              editable={!loading && !submitting}
            />

            <Button
              title="Entrar"
              onPress={handleSubmit}
              loading={submitting || loading}
              style={{ marginTop: spacing.lg }}
            />

            <Text style={styles.disclaimer}>
              Acesso restrito a administradores.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xxl,
  },
  brand: { alignItems: 'center', gap: 4 },
  brandTitle: { color: colors.text, fontSize: fontSizes.display, fontWeight: '800' },
  brandSubtitle: { color: colors.textMuted, fontSize: fontSizes.md },
  form: { gap: spacing.xs },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.md,
  },
  disclaimer: {
    color: colors.textDim,
    fontSize: fontSizes.xs,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
