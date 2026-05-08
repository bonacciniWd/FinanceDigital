import { View, type ViewProps, type ViewStyle, StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  } as ViewStyle,
});
