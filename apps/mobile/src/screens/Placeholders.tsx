/**
 * Placeholders das telas que serão implementadas em iterações futuras.
 * Cada tela exporta um componente vazio mas navegável.
 */
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, spacing } from '../theme/tokens';

function Placeholder({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={56} color={colors.primary} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Em construção. Disponível em breve.</Text>
    </View>
  );
}

// Todas as telas foram migradas para arquivos dedicados.
// Este arquivo é mantido apenas como utilitário caso seja preciso
// criar placeholders rapidamente em iterações futuras.
export const _Placeholder = Placeholder;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
});
