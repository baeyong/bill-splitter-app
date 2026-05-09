import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useBill } from '../context/BillContext';
import { useReceipts } from '../context/ReceiptsContext';
import { ScreenProps } from '../types/navigation';
import { calculateBreakdown } from '../utils/calculate';

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatPickerLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

export default function SummaryScreen({ navigation }: ScreenProps<'Summary'>) {
  const { bill, resetBill, editingReceiptId, clearEditing } = useBill();
  const { saveReceipt, updateReceipt, receipts, ownerName, setOwnerName } = useReceipts();
  const isEditing = editingReceiptId !== null;
  const editingReceipt = useMemo(
    () => (editingReceiptId ? receipts.find((r) => r.id === editingReceiptId) ?? null : null),
    [receipts, editingReceiptId],
  );
  const result = useMemo(() => calculateBreakdown(bill), [bill]);
  const [expected, setExpected] = useState('');

  const expectedNum = parseFloat(expected);
  const diff =
    !isNaN(expectedNum) && expectedNum >= 0 ? result.grandTotal - expectedNum : null;
  const matches = diff !== null && Math.abs(diff) < 0.01;

  const [restaurant, setRestaurant] = useState('');
  const [notes, setNotes] = useState('');
  const [ownerPersonId, setOwnerPersonId] = useState<string | undefined>(undefined);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState<Date>(() => new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    if (isEditing) return;
    if (ownerPersonId) return;
    if (!ownerName) return;
    const match = bill.people.find(
      (p) => p.name.trim().toLowerCase() === ownerName.trim().toLowerCase(),
    );
    if (match) setOwnerPersonId(match.id);
  }, [isEditing, ownerName, bill.people, ownerPersonId]);

  // Prefill the save form once when entering edit mode.
  useEffect(() => {
    if (!editingReceiptId) return;
    const r = receipts.find((rr) => rr.id === editingReceiptId);
    if (!r) return;
    setRestaurant(r.restaurantName ?? '');
    setNotes(r.notes ?? '');
    setOwnerPersonId(r.ownerPersonId);
    setReceiptDate(new Date(r.createdAt));
    setSavedId(null);
  }, [editingReceiptId]);

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

  const onSave = () => {
    if (bill.people.length === 0) return;
    const input = {
      restaurantName: restaurant.trim() || undefined,
      notes: notes.trim() || undefined,
      ownerPersonId,
      bill,
      breakdown: result.rows,
      grandSubtotal: result.grandSubtotal,
      grandTax: result.grandTax,
      grandTip: result.grandTip,
      grandTotal: result.grandTotal,
      createdAt: receiptDate.getTime(),
    };
    if (ownerPersonId) {
      const owner = bill.people.find((p) => p.id === ownerPersonId);
      if (owner) setOwnerName(owner.name);
    }
    if (isEditing && editingReceiptId) {
      updateReceipt(editingReceiptId, input);
      clearEditing();
      resetBill();
      navigation.navigate('ReceiptDetail', { receiptId: editingReceiptId });
      return;
    }
    const receipt = saveReceipt(input);
    setSavedId(receipt.id);
  };

  const cancelEdit = () => {
    clearEditing();
    resetBill();
    navigation.popToTop();
    navigation.navigate('Receipts');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {isEditing && (
        <View style={styles.editBanner}>
          <Text style={styles.editBannerText}>
            ✎ Editing receipt
            {editingReceipt?.restaurantName ? ` · ${editingReceipt.restaurantName}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.settingsRow}>
        <Text style={styles.settingsText}>
          {bill.stateCode} · Tax {bill.taxRatePercent}% · Tip{' '}
          {bill.tipMode === 'percent' ? `${bill.tipValue}%` : `$${bill.tipValue.toFixed(2)}`}
        </Text>
      </View>

      {result.rows.map((row) => {
        const person = bill.people.find((p) => p.id === row.personId);
        const sharedForPerson = bill.sharedItems.filter((s) => s.personIds.includes(row.personId));
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
                <Text style={styles.breakdownLabel}>Items shared</Text>
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
            {((person && person.items.length > 0) || sharedForPerson.length > 0) && (
              <View style={styles.itemsList}>
                {person?.items.map((it) => (
                  <View key={it.id} style={styles.itemLineRow}>
                    <Text style={styles.itemLineName} numberOfLines={1}>
                      • {it.name}
                    </Text>
                    <Text style={styles.itemLinePrice}>${it.price.toFixed(2)}</Text>
                  </View>
                ))}
                {sharedForPerson.map((s) => (
                  <View key={s.id} style={styles.itemLineRow}>
                    <Text style={styles.itemLineName} numberOfLines={1}>
                      • {s.name}{' '}
                      <Text style={styles.itemLineShared}>(shared 1/{s.personIds.length})</Text>
                    </Text>
                    <Text style={styles.itemLinePrice}>
                      ${(s.totalPrice / s.personIds.length).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
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

      <View style={styles.saveBlock}>
        <Text style={styles.saveTitle}>{isEditing ? 'Receipt details' : 'Save this receipt'}</Text>
        {!isEditing && (
          <Text style={styles.saveHint}>
            Optional. Keeps a copy on this phone for later reference.
          </Text>
        )}
        <TextInput
          style={styles.input}
          value={restaurant}
          onChangeText={setRestaurant}
          placeholder="Restaurant (optional)"
          autoCapitalize="words"
        />
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          multiline
        />
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Date</Text>
          <TouchableOpacity onPress={() => setDatePickerOpen(true)} style={styles.dateBtn}>
            <Text style={styles.dateBtnText}>{formatPickerLabel(receiptDate)}</Text>
            <Text style={styles.dateBtnChange}>Change</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subLabel}>Which one was you?</Text>
        <View style={styles.chipRow}>
          {bill.people.map((p) => {
            const on = ownerPersonId === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setOwnerPersonId(on ? undefined : p.id)}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {savedId && !isEditing ? (
          <View style={styles.savedRow}>
            <Text style={styles.savedText}>✓ Saved</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Receipts')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.savedLink}>View receipts</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
            <Text style={styles.saveBtnText}>
              {isEditing ? 'Save changes' : 'Save receipt'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {isEditing ? (
        <TouchableOpacity style={styles.resetBtn} onPress={cancelEdit}>
          <Text style={styles.resetBtnText}>Cancel edit</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.resetBtn} onPress={confirmReset}>
          <Text style={styles.resetBtnText}>Start new bill</Text>
        </TouchableOpacity>
      )}
    </ScrollView>

    <Modal
      visible={datePickerOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setDatePickerOpen(false)}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={() => setDatePickerOpen(false)}
      >
        <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>Receipt date</Text>
          <Calendar
            current={ymdLocal(receiptDate)}
            initialDate={ymdLocal(receiptDate)}
            markedDates={{
              [ymdLocal(receiptDate)]: { selected: true, selectedColor: '#3AB795' },
            }}
            onDayPress={(d: DateData) => {
              setReceiptDate(new Date(d.year, d.month - 1, d.day));
              setDatePickerOpen(false);
            }}
            theme={{
              todayTextColor: '#3AB795',
              arrowColor: '#3AB795',
              selectedDayBackgroundColor: '#3AB795',
              selectedDayTextColor: '#fff',
            }}
          />
          <TouchableOpacity
            style={styles.modalTodayBtn}
            onPress={() => {
              setReceiptDate(new Date());
              setDatePickerOpen(false);
            }}
          >
            <Text style={styles.modalTodayBtnText}>Today</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, paddingBottom: 40 },
  settingsRow: { marginBottom: 12 },
  settingsText: { fontSize: 13, color: '#666' },
  editBanner: {
    backgroundColor: '#FFF8E1',
    borderColor: '#F2C94C',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  editBannerText: { fontSize: 13, fontWeight: '600', color: '#7A5C00' },
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
  itemsList: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 2,
  },
  itemLineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemLineName: { flex: 1, fontSize: 13, color: '#444', paddingRight: 8 },
  itemLinePrice: { fontSize: 13, color: '#666', fontVariant: ['tabular-nums'] },
  itemLineShared: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dateLabel: { fontSize: 14, fontWeight: '600', color: '#444' },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dateBtnText: { fontSize: 14, color: '#222' },
  dateBtnChange: { fontSize: 13, color: '#3AB795', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
  modalTodayBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#E8F7F1',
  },
  modalTodayBtnText: { color: '#3AB795', fontWeight: '600', fontSize: 14 },
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
    marginBottom: 16,
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
  saveBlock: {
    backgroundColor: '#F7F9FB',
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    gap: 10,
  },
  saveTitle: { fontSize: 16, fontWeight: '700' },
  saveHint: { fontSize: 13, color: '#777' },
  notesInput: { minHeight: 60, textAlignVertical: 'top' },
  subLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  chipOn: { backgroundColor: '#3AB795' },
  chipText: { color: '#333', fontSize: 14 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#3AB795',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  savedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  savedText: { color: '#3AB795', fontWeight: '700', fontSize: 15 },
  savedLink: { color: '#3AB795', fontWeight: '600', fontSize: 15 },
  resetBtn: {
    borderWidth: 1,
    borderColor: '#c62828',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetBtnText: { color: '#c62828', fontWeight: '600' },
});
