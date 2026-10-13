import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, text } from '../theme';
import { Person } from '../types/bill';
import { ReceiptRow, describeRow, rowWarning } from '../utils/receiptRows';
import { DashedRule, Leader, Paper, Stamp } from './paper';

/** A line in the totals block. `printed` adds the receipt's own figure under it. */
export type TotalLine = {
  label: string;
  value: number;
  bold?: boolean;
  printed?: { label: string; value: number };
};

const MATCH_TOLERANCE = 0.02;

/**
 * The bill laid out like the paper receipt it came from: one line per printed
 * line, who had it underneath, then the totals. Shared by All items and the
 * "See all" panel on AssignItems so the two always look the same.
 */
export default function ReceiptView({
  title,
  subtitle,
  rows,
  people,
  totals,
  highlightKey,
  onPressRow,
  footer,
}: {
  title?: string;
  subtitle?: string;
  rows: ReceiptRow[];
  people: Person[];
  totals: TotalLine[];
  highlightKey?: string;
  onPressRow?: (row: ReceiptRow) => void;
  footer?: React.ReactNode;
}) {
  return (
    <Paper style={styles.paper}>
      {(title || subtitle) && (
        <View style={styles.head}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={[text.hint, styles.center]}>{subtitle}</Text> : null}
        </View>
      )}
      <DashedRule />

      {rows.length === 0 && <Text style={[text.hint, styles.center]}>No items yet.</Text>}
      {rows.map((row) => {
        const who = describeRow(row, people);
        const warning = rowWarning(row);
        return (
          <Pressable
            key={row.key}
            disabled={!onPressRow}
            onPress={() => onPressRow?.(row)}
            accessibilityRole={onPressRow ? 'button' : undefined}
            accessibilityHint={onPressRow ? 'Fix this line' : undefined}
            style={({ pressed }) => [
              styles.line,
              row.key === highlightKey && styles.lineHighlighted,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.qty}>{row.quantity}</Text>
            <View style={styles.lineBody}>
              <Leader
                label={row.name || 'Unnamed item'}
                value={(row.price * row.quantity).toFixed(2)}
                bold
              />
              {who ? <Text style={text.hint}>{who}</Text> : null}
              {warning && <Text style={styles.warning}>⚠ {warning}</Text>}
            </View>
          </Pressable>
        );
      })}

      <DashedRule />
      <View style={styles.totals}>
        {totals.map((t) => {
          const matches = t.printed && Math.abs(t.printed.value - t.value) < MATCH_TOLERANCE;
          return (
            <View key={t.label} style={styles.totalBlock}>
              <Leader
                label={t.label}
                value={t.value.toFixed(2)}
                size={t.bold ? 'xl' : 'sm'}
                bold={t.bold}
              />
              {t.printed && (
                <Text style={[styles.printed, { color: matches ? colors.stamp : colors.danger }]}>
                  {t.printed.label} {t.printed.value.toFixed(2)} {matches ? '✓' : '✗'}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {footer}
    </Paper>
  );
}

/** "Every line assigned" when it is — used under the receipt. */
export function AllAssignedStamp({ rows }: { rows: ReceiptRow[] }) {
  if (rows.length === 0 || rows.some((r) => r.unassigned > 0)) return null;
  return <Stamp label="Every line assigned" rotate={-4} style={styles.stamp} />;
}

const styles = StyleSheet.create({
  paper: { paddingVertical: 22, gap: 12 },
  head: { alignItems: 'center', gap: 4 },
  title: { ...text.title, textAlign: 'center' },
  center: { textAlign: 'center' },
  line: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  lineHighlighted: { backgroundColor: colors.ground },
  qty: { width: 20, fontFamily: fonts.monoBold, fontSize: 15, color: colors.muted },
  lineBody: { flex: 1, gap: 3 },
  warning: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.warn,
    textTransform: 'uppercase',
  },
  totals: { gap: 6 },
  totalBlock: { gap: 1 },
  printed: {
    alignSelf: 'flex-end',
    fontFamily: fonts.monoBold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  stamp: { alignSelf: 'center', marginTop: 8 },
});
