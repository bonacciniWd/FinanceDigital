import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, fontSizes } from '../../theme/tokens';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const tones: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  danger:  { bg: colors.dangerBg,  fg: colors.danger },
  info:    { bg: 'rgba(6,182,212,0.15)', fg: colors.info },
  neutral: { bg: 'rgba(148,163,184,0.15)', fg: colors.textMuted },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = tones[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
