import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useBill } from '../context/BillContext';
import { ScreenProps } from '../types/navigation';
import { calculateBreakdown } from '../utils/calculate';

export default function SummaryScreen({ navigation }: ScreenProps<'Summary'>) {
  const { bill, resetBill } = useBill();
  const result = useMemo(() => calculateBreakdown(bill), [bill]);
  const [expected, setExpected] = useState('');

  const expectedNum = parseFloat(expected);
  const diff =
    !isNaN(expectedNum) && expectedNum >= 0 ? result.grandTotal - expectedNum : null;
  const matches = diff !== null && Math.abs(diff) < 0.01;

  const confirmReset = () => {
    Alert.alert(
      'Start new bill?',
      'This clears all people, items, and shared dishes. Tax/tip settings stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetBill();
            navigation.popToTop();
            navigation.navigate('People');
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.settingsRow}>
        <Text style={styles.settingsText}>
          {bill.stateCode} · Tax {bill.taxRatePercent}% · Tip{' '}
          {bill.tipMode === 'percent' ? `${bill.tipValue}%` : `$${bill.tipValue.toFixed(2)}`}
        </Text>
      </View>

      {result.rows.map((row) => {
        const person = bill.people.find((p) => p.id === row.personId);
        return (
          <TouchableOpacity
            key={row.personId}
            style={styles.card}
            onPress={() => navigation.navigate('PersonItems', { personId: row.personId })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{row.name}</Text>
              <Text style={styles.cardTotal}>${row.total.toFixed(2)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Items</Text>
              <Text style={styles.breakdownValue}>${row.ownItemsTotal.toFixed(2)}</Text>
            </View>
            {row.sharedShare > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Shared share</Text>
                <Text style={styles.breakdownValue}>${row.sharedShare.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Subtotal</Text>
              <Text style={styles.breakdownValue}>${row.subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Tax ({bill.taxRatePercent}%)</Text>
              <Text style={styles.breakdownValue}>${row.tax.toFixed(2)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Tip</Text>
              <Text style={styles.breakdownValue}>${row.tip.toFixed(2)}</Text>
            </View>
            <Text style={styles.tapHint}>
              {person?.items.length ?? 0} item(s) · tap to edit
            </Text>
          </TouchableOpacity>
        );
      })}

      <View style={styles.totalsBlock}>
        <View style={styles.breakdownRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>${result.grandSubtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.totalsLabel}>Tax</Text>
          <Text style={styles.totalsValue}>${result.grandTax.toFixed(2)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.totalsLabel}>Tip</Text>
          <Text style={styles.totalsValue}>${result.grandTip.toFixed(2)}</Text>
        </View>
        <View style={[styles.breakdownRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>Grand total</Text>
          <Text style={styles.grandValue}>${result.grandTotal.toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.verifyBlock}>
        <Text style={styles.verifyLabel}>Receipt total (to verify)</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={expected}
          onChangeText={setExpected}
          placeholder="e.g. 124.50"
        />
        {diff !== null && (
          <Text style={[styles.diffText, matches ? styles.diffOk : styles.diffBad]}>
            {matches
              ? '✓ Matches the receipt'
              : `Off by $${diff.toFixed(2)} (${diff > 0 ? 'calculated higher' : 'calculated lower'})`}
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.resetBtn} onPress={confirmReset}>
        <Text style={styles.resetBtnText}>Start new bill</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, paddingBottom: 40 },
  settingsRow: { marginBottom: 12 },
  settingsText: { fontSize: 13, color: '#666' },
  card: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardName: { fontSize: 17, fontWeight: '700' },
  cardTotal: { fontSize: 18, fontWeight: '700', color: '#3AB795' },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  breakdownLabel: { fontSize: 14, color: '#555' },
  breakdownValue: { fontSize: 14, color: '#333' },
  tapHint: { fontSize: 12, color: '#999', marginTop: 6, fontStyle: 'italic' },
  totalsBlock: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  totalsLabel: { fontSize: 15, color: '#444' },
  totalsValue: { fontSize: 15, color: '#222' },
  grandRow: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 10,
    marginTop: 6,
  },
  grandLabel: { fontSize: 17, fontWeight: '700' },
  grandValue: { fontSize: 19, fontWeight: '700', color: '#3AB795' },
  verifyBlock: {
    backgroundColor: '#E8F7F1',
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
  },
  verifyLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  diffText: { marginTop: 8, fontSize: 14, fontWeight: '600' },
  diffOk: { color: '#3AB795' },
  diffBad: { color: '#c62828' },
  resetBtn: {
    borderWidth: 1,
    borderColor: '#c62828',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetBtnText: { color: '#c62828', fontWeight: '600' },
});
