import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, fontSizes } from '../../theme/tokens';
import { Card } from './Card';

interface Props {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export function StatCard({ label, value, hint, tone = 'default' }: Props) {
  const valueColor =
    tone === 'success' ? colors.success :
    tone === 'warning' ? colors.warning :
    tone === 'danger' ? colors.danger :
    colors.text;

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 88,
    padding: spacing.md,
    borderRadius: radii.md,
    gap: 4,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
  },
  hint: {
    color: colors.textDim,
    fontSize: fontSizes.xs,
  },
});
