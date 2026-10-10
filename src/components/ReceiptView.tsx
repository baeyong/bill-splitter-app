import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Person } from '../types/bill';
import { ReceiptRow, describeRow, rowWarning } from '../utils/receiptRows';

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
  rows,
  people,
  totals,
  highlightKey,
  onPressRow,
}: {
  title?: string;
  rows: ReceiptRow[];
  people: Person[];
  totals: TotalLine[];
  highlightKey?: string;
  onPressRow?: (row: ReceiptRow) => void;
}) {
  return (
    <View style={styles.paper}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.dashed} />

      {rows.length === 0 && <Text style={styles.empty}>No items yet.</Text>}
      {rows.map((row) => {
        const who = describeRow(row, people);
        const warning = rowWarning(row);
        return (
          <TouchableOpacity
            key={row.key}
            disabled={!onPressRow}
            onPress={() => onPressRow?.(row)}
            style={[styles.line, row.key === highlightKey && styles.lineHighlighted]}
          >
            <Text style={styles.qty}>{row.quantity}</Text>
            <View style={styles.flex}>
              <Text style={styles.name}>{row.name || 'Unnamed item'}</Text>
              {who ? <Text style={styles.who}>{who}</Text> : null}
              {warning && <Text style={styles.warning}>⚠ {warning}</Text>}
            </View>
            <Text style={styles.amount}>${(row.price * row.quantity).toFixed(2)}</Text>
          </TouchableOpacity>
        );
      })}

      <View style={styles.dashed} />
      {totals.map((t) => {
        const matches = t.printed && Math.abs(t.printed.value - t.value) < MATCH_TOLERANCE;
        return (
          <View key={t.label} style={styles.totalBlock}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, t.bold && styles.bold]}>{t.label}</Text>
              <Text style={[styles.totalValue, t.bold && styles.bold]}>${t.value.toFixed(2)}</Text>
            </View>
            {t.printed && (
              <Text style={[styles.printed, matches ? styles.ok : styles.bad]}>
                {t.printed.label}: ${t.printed.value.toFixed(2)} {matches ? '✓' : '✗'}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  paper: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center', color: '#222', marginBottom: 6 },
  // iOS only draws dashed borders on a full border, so this is a 1px box.
  dashed: {
    height: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    borderRadius: 1,
    marginVertical: 10,
  },
  empty: { color: '#999', textAlign: 'center', paddingVertical: 12 },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: 6,
  },
  lineHighlighted: { backgroundColor: '#E8F7F1' },
  qty: { width: 22, fontSize: 15, fontWeight: '600', color: '#555', fontVariant: ['tabular-nums'] },
  name: { fontSize: 15, fontWeight: '600', color: '#222' },
  who: { fontSize: 13, color: '#777', marginTop: 2 },
  warning: { fontSize: 13, color: '#c77700', fontWeight: '600', marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '600', color: '#222', fontVariant: ['tabular-nums'] },
  totalBlock: { paddingVertical: 3 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 15, color: '#444' },
  totalValue: { fontSize: 15, color: '#222', fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700', fontSize: 17, color: '#222' },
  printed: { fontSize: 12, textAlign: 'right', marginTop: 1 },
  ok: { color: '#3AB795' },
  bad: { color: '#c62828' },
});
