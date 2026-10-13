import React, { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Column, DashedRule, Leader, Paper, PaperButton, Stamp, TornEdge } from '../components/paper';
import { useBill } from '../context/BillContext';
import { useReceipts } from '../context/ReceiptsContext';
import { ScreenProps } from '../types/navigation';
import { colors, fonts, text } from '../theme';
import { describeTax } from '../utils/calculate';

const formatDateTime = (ts: number) =>
  new Date(ts)
    .toLocaleString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(/,/g, '')
    .replace(/ (\d{4}) /, ' $1 · ');

export default function ReceiptDetailScreen({ navigation, route }: ScreenProps<'ReceiptDetail'>) {
  const { receiptId, justSaved } = route.params;
  const { receipts, deleteReceipt } = useReceipts();
  const { bill, loadFromReceipt } = useBill();
  const receipt = useMemo(
    () => receipts.find((r) => r.id === receiptId),
    [receipts, receiptId],
  );

  const onEdit = () => {
    if (!receipt) return;
    const hasInProgress = bill.people.length > 0 || bill.sharedItems.length > 0;
    const enter = () => {
      loadFromReceipt(receipt);
      navigation.navigate('Summary');
    };
    if (hasInProgress) {
      Alert.alert(
        'Discard current bill?',
        'You have a bill in progress. Editing this receipt will discard it.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard & edit', style: 'destructive', onPress: enter },
        ],
      );
    } else {
      enter();
    }
  };

  if (!receipt) {
    return (
      <View style={styles.flex}>
        <Text style={[text.hint, styles.empty]}>Receipt not found.</Text>
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

  const tipLabel =
    receipt.bill.tipMode === 'percent'
      ? `${receipt.bill.tipValue}%`
      : `$${receipt.bill.tipValue.toFixed(2)}`;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Column style={styles.stack}>
        <View>
          <Paper style={styles.paper}>
            {justSaved && <Stamp label="Saved ✓" rotate={8} style={styles.savedStamp} />}
            <View style={styles.head}>
              <Text style={styles.title}>{receipt.restaurantName?.trim() || 'Receipt'}</Text>
              <Text style={text.label}>{formatDateTime(receipt.createdAt)}</Text>
              <Text style={text.label}>
                {receipt.bill.stateCode} · Tax {describeTax(receipt.bill)} · Tip {tipLabel}
              </Text>
            </View>

            {ownerRow ? (
              <View style={styles.shareBox}>
                <Text style={text.label}>Your share ({ownerRow.name})</Text>
                <Text style={styles.shareValue}>${ownerRow.total.toFixed(2)}</Text>
              </View>
            ) : (
              <Text style={text.hint}>You weren't tagged on this receipt, so it doesn't count toward your spend.</Text>
            )}

            {receipt.notes ? (
              <View style={styles.notes}>
                <Text style={text.label}>Notes</Text>
                <Text style={text.body}>{receipt.notes}</Text>
              </View>
            ) : null}

            <DashedRule />
            {receipt.breakdown.map((row) => (
              <View key={row.personId} style={styles.person}>
                <Leader label={row.name} value={row.total.toFixed(2)} size="lg" bold />
                <Text style={styles.breakdown}>
                  Items {row.subtotal.toFixed(2)} + tax {row.tax.toFixed(2)} + tip {row.tip.toFixed(2)}
                </Text>
              </View>
            ))}
            <DashedRule />
            <View style={styles.totals}>
              <Leader label="Subtotal" value={receipt.grandSubtotal.toFixed(2)} size="sm" />
              <Leader label="Tax" value={receipt.grandTax.toFixed(2)} size="sm" />
              <Leader label="Tip" value={receipt.grandTip.toFixed(2)} size="sm" />
              <Leader label="Total" value={receipt.grandTotal.toFixed(2)} size="xl" bold style={styles.grand} />
            </View>
            <Text style={styles.thanks} accessibilityElementsHidden>
              *** Thank you ***
            </Text>
          </Paper>
          <TornEdge />
        </View>

        <PaperButton title="Edit receipt" onPress={onEdit} />
        <PaperButton title="Delete receipt" variant="danger" compact onPress={onDelete} />
      </Column>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  container: { padding: 20, paddingTop: 8, paddingBottom: 40 },
  stack: { gap: 14 },
  empty: { textAlign: 'center', marginTop: 40 },
  paper: { paddingVertical: 24, gap: 14 },
  savedStamp: { position: 'absolute', top: 16, right: 14, zIndex: 1 },
  head: { gap: 3, paddingRight: 90 },
  title: { ...text.title, fontSize: 22 },
  shareBox: { borderWidth: 2, borderColor: colors.ink, padding: 14, gap: 2 },
  shareValue: { fontFamily: fonts.monoBold, fontSize: 32, color: colors.ink, fontVariant: ['tabular-nums'] },
  notes: { gap: 4 },
  person: { gap: 3 },
  breakdown: { ...text.label, fontSize: 11, letterSpacing: 0.5 },
  totals: { gap: 6 },
  grand: { marginTop: 6 },
  thanks: { ...text.label, textAlign: 'center', fontSize: 11, letterSpacing: 2, marginTop: 6 },
});
