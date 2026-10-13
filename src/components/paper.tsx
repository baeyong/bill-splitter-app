// The receipt look's building blocks. Every screen is made of these, so a
// change to how paper, rules, stamps or buttons look happens here once.
import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fonts, MAX_COLUMN_WIDTH } from '../theme';

/** A sheet of receipt paper. */
export function Paper({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.paper, style]}>{children}</View>;
}

// iOS only draws dashed and dotted borders around a whole box, so a rule is a
// box clipped down to its top edge.
function ClippedBorder({
  dash,
  width,
  style,
}: {
  dash: 'dashed' | 'dotted';
  width: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ height: width, overflow: 'hidden' }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{ height: 12, borderWidth: width, borderStyle: dash, borderColor: colors.rule }}
      />
    </View>
  );
}

/** The dashed line between sections of a receipt. */
export function DashedRule({ style }: { style?: StyleProp<ViewStyle> }) {
  return <ClippedBorder dash="dashed" width={1.5} style={style} />;
}

type LeaderSize = 'sm' | 'md' | 'lg' | 'xl';
const leaderText: Record<LeaderSize, TextStyle> = {
  sm: { fontSize: 13 },
  md: { fontSize: 15 },
  lg: { fontSize: 17 },
  xl: { fontSize: 22 },
};

/** `ALICE ……… 27.91` — a label and an amount joined by a dotted leader. */
export function Leader({
  label,
  value,
  size = 'md',
  bold = false,
  valueStyle,
  style,
}: {
  label: string;
  value: string;
  size?: LeaderSize;
  bold?: boolean;
  valueStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const font = { fontFamily: bold ? fonts.monoBold : fonts.mono, ...leaderText[size] };
  return (
    <View style={[styles.leader, style]} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={[styles.leaderLabel, font]}>{label}</Text>
      <ClippedBorder dash="dotted" width={2} style={styles.leaderDots} />
      <Text style={[styles.leaderValue, font, valueStyle]}>{value}</Text>
    </View>
  );
}

/** A rubber stamp, slightly crooked: "MATCHES RECEIPT ✓", "SAVED ✓". */
export function Stamp({
  label,
  rotate = -4,
  color = colors.stamp,
  size = 13,
  style,
}: {
  label: string;
  rotate?: number;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.stamp,
        { borderColor: color, transform: [{ rotate: `${rotate}deg` }] },
        style,
      ]}
    >
      <Text style={[styles.stampText, { color, fontSize: size }]}>{label}</Text>
    </View>
  );
}

type ButtonVariant = 'primary' | 'outline' | 'danger';

/** Solid ink for the main action, outlined for the rest, red for destructive. */
export function PaperButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  compact = false,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        buttonVariants[variant],
        (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 },
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: variant === 'primary' ? colors.paper : variant === 'danger' ? colors.danger : colors.ink },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.ink },
  outline: { borderWidth: 1.5, borderColor: colors.ink },
  danger: { borderWidth: 1.5, borderColor: colors.danger },
};

/** The zig-zag bottom of a receipt torn off the printer. */
export function TornEdge() {
  return (
    <View
      style={styles.torn}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: 64 }, (_, i) => (
        <View key={i} style={styles.tooth} />
      ))}
    </View>
  );
}

/** Keeps content phone-width and centred on iPad. */
export function Column({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.column, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: colors.paper,
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.shadow,
  },
  leader: { flexDirection: 'row', alignItems: 'flex-end' },
  leaderLabel: { color: colors.ink, textTransform: 'uppercase', flexShrink: 1 },
  leaderDots: { flex: 1, marginHorizontal: 6, marginBottom: 5, minWidth: 12 },
  leaderValue: { color: colors.ink, fontVariant: ['tabular-nums'] },
  stamp: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.paper,
  },
  stampText: { fontFamily: fonts.monoBold, letterSpacing: 1.5, textTransform: 'uppercase' },
  button: {
    height: 56,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { height: 48 },
  buttonText: {
    fontFamily: fonts.monoBold,
    fontSize: 15,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  torn: { height: 8, flexDirection: 'row', overflow: 'hidden' },
  tooth: {
    width: 12,
    height: 12,
    marginTop: -7,
    backgroundColor: colors.paper,
    transform: [{ rotate: '45deg' }],
  },
  column: { width: '100%', maxWidth: MAX_COLUMN_WIDTH, alignSelf: 'center' },
});

