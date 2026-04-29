import React, { useLayoutEffect, useMemo } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useReceipts } from '../context/ReceiptsContext';
import { ScreenProps } from '../types/navigation';

const formatDateTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function ReceiptDetailScreen({ navigation, route }: ScreenProps<'ReceiptDetail'>) {
  const { receiptId } = route.params;
  const { receipts, deleteReceipt } = useReceipts();
  const receipt = useMemo(
    () => receipts.find((r) => r.id === receiptId),
    [receipts, receiptId],
  );

  useLayoutEffect(() => {
    if (!receipt) return;
    navigation.setOptions({
      title: receipt.restaurantName?.trim() || 'Receipt',
    });
  }, [navigation, receipt]);

  if (!receipt) {
    return (
      <View style={styles.flex}>
        <Text style={styles.empty}>Receipt not found.</Text>
      </View>
    );
  }

  const ownerRow = receipt.ownerPersonId
    ? receipt.breakdown.find((b) => b.personId === receipt.ownerPersonId)
    : undefined;

  const onDelete = () => {
    Alert.alert(
      'Delete this receipt?',
      'This removes it from your saved history. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteReceipt(receipt.id);
            navigation.goBack();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.metaTop}>{formatDateTime(receipt.createdAt)}</Text>
      <Text style={styles.settingsText}>
        {receipt.bill.stateCode} · Tax {receipt.bill.taxRatePercent}% · Tip{' '}
        {receipt.bill.tipMode === 'percent'
          ? `${receipt.bill.tipValue}%`
          : `$${receipt.bill.tipValue.toFixed(2)}`}
      </Text>

      {ownerRow && (
        <View style={styles.youCard}>
          <Text style={styles.youLabel}>Your share</Text>
          <Text style={styles.youValue}>${ownerRow.total.toFixed(2)}</Text>
          <Text style={styles.youSub}>(saved as {ownerRow.name})</Text>
        </View>
      )}

      {receipt.notes ? (
        <View style={styles.notesCard}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{receipt.notes}</Text>
        </View>
      ) : null}

      {receipt.breakdown.map((row) => (
        <View key={row.personId} style={styles.card}>
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
              <Text style={styles.breakdownLabel}>Items shared</Text>
              <Text style={styles.breakdownValue}>${row.sharedShare.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Subtotal</Text>
            <Text style={styles.breakdownValue}>${row.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Tax</Text>
            <Text style={styles.breakdownValue}>${row.tax.toFixed(2)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Tip</Text>
            <Text style={styles.breakdownValue}>${row.tip.toFixed(2)}</Text>
          </View>
        </View>
      ))}

      <View style={styles.totalsBlock}>
        <View style={styles.breakdownRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>${receipt.grandSubtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.totalsLabel}>Tax</Text>
          <Text style={styles.totalsValue}>${receipt.grandTax.toFixed(2)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.totalsLabel}>Tip</Text>
          <Text style={styles.totalsValue}>${receipt.grandTip.toFixed(2)}</Text>
        </View>
        <View style={[styles.breakdownRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>Grand total</Text>
          <Text style={styles.grandValue}>${receipt.grandTotal.toFixed(2)}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
        <Text style={styles.deleteBtnText}>Delete receipt</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, paddingBottom: 40 },
  metaTop: { fontSize: 14, fontWeight: '600', color: '#444' },
  settingsText: { fontSize: 13, color: '#666', marginTop: 2, marginBottom: 14 },
  youCard: {
    backgroundColor: '#E8F7F1',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  youLabel: { fontSize: 13, color: '#3AB795', fontWeight: '600' },
  youValue: { fontSize: 26, fontWeight: '800', color: '#222', marginTop: 2 },
  youSub: { fontSize: 12, color: '#666', marginTop: 2 },
  notesCard: {
    backgroundColor: '#F7F9FB',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  notesLabel: { fontSize: 13, fontWeight: '600', color: '#444' },
  notesText: { fontSize: 14, color: '#333', marginTop: 4 },
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
  totalsBlock: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 20,
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
  empty: { color: '#999', textAlign: 'center', marginTop: 40 },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#c62828',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteBtnText: { color: '#c62828', fontWeight: '600' },
});
