import { usePreventRemove } from '@react-navigation/native';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { Column, DashedRule, Leader, Paper, PaperButton, Stamp } from '../components/paper';
import { useBill } from '../context/BillContext';
import { useReceipts } from '../context/ReceiptsContext';
import { getStateByCode } from '../data/stateTaxRates';
import { calendarTheme, colors, fonts, text } from '../theme';
import { Bill } from '../types/bill';
import { ScreenProps } from '../types/navigation';
import { calculateBreakdown, round2 } from '../utils/calculate';
import { parseAmount } from '../utils/money';

/** iPads in landscape (and big ones in portrait) get the two-column layout. */
const WIDE_LAYOUT = 900;
const MATCH_TOLERANCE = 0.02;

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatPickerLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/** "Coke × 2 · Burger · Fries × 2 (1/3)" — what one person had, briefly. */
const itemsSummary = (bill: Bill, personId: string): string => {
  const counts = new Map<string, { label: string; n: number }>();
  const bump = (key: string, label: string) => {
    const c = counts.get(key);
    if (c) c.n += 1;
    else counts.set(key, { label, n: 1 });
  };
  for (const item of bill.people.find((p) => p.id === personId)?.items ?? []) {
    bump(`o:${item.name.trim().toLowerCase()}`, item.name.trim());
  }
  for (const s of bill.sharedItems) {
    if (!s.personIds.includes(personId)) continue;
    bump(`s:${s.name.trim().toLowerCase()}:${s.personIds.length}`, `${s.name.trim()}|1/${s.personIds.length}`);
  }
  return [...counts.values()]
    .map(({ label, n }) => {
      const [name, share] = label.split('|');
      return `${name}${n > 1 ? ` × ${n}` : ''}${share ? ` (${share})` : ''}`;
    })
    .join(' · ');
};

export default function SummaryScreen({ navigation }: ScreenProps<'Summary'>) {
  const { bill, savedTax, resetBill, editingReceiptId, setTipMode, setTipValue, setBillTax } =
    useBill();
  const { saveReceipt, updateReceipt, receipts, ownerName, setOwnerName } = useReceipts();
  const [tipInput, setTipInput] = useState(String(bill.tipValue));

  // Re-sync only when the mode changes or we're entering edit mode —
  // not on every keystroke (which would clobber the user mid-type).
  useEffect(() => {
    setTipInput(String(bill.tipValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.tipMode, editingReceiptId]);

  // An empty box means no tip — otherwise deleting "18" left the tip at 1%.
  const onTipChange = (s: string) => {
    setTipInput(s);
    const n = s.trim() === '' ? 0 : parseAmount(s);
    if (!isNaN(n)) setTipValue(n);
  };
  // Tax works like tip: a % or an exact $ amount, for this bill only.
  const taxMode = bill.taxMode ?? 'percent';
  const taxValueText = () =>
    taxMode === 'amount' ? (bill.taxAmount ?? 0).toFixed(2) : String(bill.taxRatePercent);
  const [taxInput, setTaxInput] = useState(taxValueText);
  useEffect(() => {
    setTaxInput(taxValueText());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxMode, editingReceiptId]);

  const onTaxChange = (s: string) => {
    setTaxInput(s);
    const n = s.trim() === '' ? 0 : parseAmount(s);
    if (isNaN(n)) return;
    setBillTax(taxMode === 'amount' ? { taxAmount: n } : { taxRatePercent: n });
  };
  const savedState = getStateByCode(savedTax.stateCode);
  const onSavedRate = taxMode === 'percent' && bill.taxRatePercent === savedTax.taxRatePercent;
  const fromReceipt =
    taxMode === 'amount' && bill.scan?.tax !== undefined && bill.taxAmount === bill.scan.tax;
  const revertToSavedRate = () => {
    setBillTax({ taxMode: 'percent', taxRatePercent: savedTax.taxRatePercent });
    setTaxInput(String(savedTax.taxRatePercent));
  };

  const isEditing = editingReceiptId !== null;
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('AllItems')}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={styles.headerLink}>All items</Text>
        </Pressable>
      ),
    });
  }, [navigation]);
  const editingReceipt = useMemo(
    () => (editingReceiptId ? receipts.find((r) => r.id === editingReceiptId) ?? null : null),
    [receipts, editingReceiptId],
  );
  const result = useMemo(() => calculateBreakdown(bill), [bill]);
  // Switching to $ starts from the tax currently charged, not from zero.
  const switchTaxMode = (mode: 'percent' | 'amount') => {
    if (mode === taxMode) return;
    setBillTax(mode === 'amount' ? { taxMode: mode, taxAmount: result.grandTax } : { taxMode: mode });
  };
  const [expected, setExpected] = useState('');

  const expectedNum = parseAmount(expected);
  const diff =
    !isNaN(expectedNum) && expectedNum >= 0 ? result.grandTotal - expectedNum : null;
  const matches = diff !== null && Math.abs(diff) < 0.01;

  // A scan already knows the restaurant; edit mode overwrites this below.
  const [restaurant, setRestaurant] = useState(() => bill.scan?.restaurantName ?? '');
  const [notes, setNotes] = useState('');
  const [ownerPersonId, setOwnerPersonId] = useState<string | undefined>(undefined);
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
  }, [editingReceiptId]);

  const isDirty = useMemo(() => {
    if (!editingReceipt) return false;
    return (
      JSON.stringify(bill) !== JSON.stringify(editingReceipt.bill) ||
      restaurant.trim() !== (editingReceipt.restaurantName ?? '') ||
      notes.trim() !== (editingReceipt.notes ?? '') ||
      ownerPersonId !== editingReceipt.ownerPersonId ||
      receiptDate.getTime() !== editingReceipt.createdAt
    );
  }, [editingReceipt, bill, restaurant, notes, ownerPersonId, receiptDate]);

  // Clearing the bill while this screen is still animating out would flash an
  // empty summary, so the reset waits until it unmounts.
  const resetOnUnmount = useRef(false);
  const resetBillRef = useRef(resetBill);
  resetBillRef.current = resetBill;
  useEffect(
    () => () => {
      if (resetOnUnmount.current) resetBillRef.current();
    },
    [],
  );

  // Every way out of edit mode — Save, Cancel, the back arrow, a swipe — lands
  // here, so the receipt can never stay half-loaded into the next new bill.
  const leavingAfterSave = useRef(false);
  usePreventRemove(isEditing, ({ data }) => {
    const leave = () => {
      resetOnUnmount.current = true;
      navigation.dispatch(data.action);
    };
    if (leavingAfterSave.current || !isDirty) {
      leave();
      return;
    }
    Alert.alert('Discard changes?', "Your edits to this receipt won't be saved.", [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  });

  const confirmReset = () => {
    Alert.alert(
      'Start new bill?',
      'This clears all people, items, and shared dishes. Your tax settings stay.',
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
      leavingAfterSave.current = true;
      navigation.popTo('ReceiptDetail', { receiptId: editingReceiptId, justSaved: true });
      return;
    }
    const receipt = saveReceipt(input);
    resetOnUnmount.current = true;
    // The bill is done — land on the saved copy, with Receipts → Home behind it.
    navigation.reset({
      index: 2,
      routes: [
        { name: 'Home' },
        { name: 'Receipts' },
        { name: 'ReceiptDetail', params: { receiptId: receipt.id, justSaved: true } },
      ],
    });
  };

  // With a scanned total we can check automatically. A receipt with no tip
  // written on it prints a pre-tip total, so compare like with like.
  const printedTotal = bill.scan?.total;
  const ourComparable =
    printedTotal === undefined
      ? null
      : bill.scan?.tip === undefined
        ? round2(result.grandSubtotal + result.grandTax)
        : result.grandTotal;
  const scanMatches =
    printedTotal !== undefined &&
    ourComparable !== null &&
    Math.abs(ourComparable - printedTotal) < MATCH_TOLERANCE;

  const guests = bill.people.length;
  const dateLabel = receiptDate
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .replace(/,/g, '');

  const modeToggle = (
    current: 'percent' | 'amount',
    onPick: (m: 'percent' | 'amount') => void,
    what: string,
  ) => (
    <View style={styles.toggle}>
      {(['percent', 'amount'] as const).map((m) => {
        const on = current === m;
        return (
          <Pressable
            key={m}
            onPress={() => onPick(m)}
            accessibilityRole="button"
            accessibilityLabel={`${what} as ${m === 'percent' ? 'a percentage' : 'a dollar amount'}`}
            accessibilityState={{ selected: on }}
            style={[styles.toggleBtn, on && styles.toggleBtnOn]}
          >
            <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{m === 'percent' ? '%' : '$'}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const editBanner = isEditing && (
    <Stamp
      label={`Editing${editingReceipt?.restaurantName ? ` · ${editingReceipt.restaurantName}` : ''}`}
      rotate={-2}
      color={colors.warn}
    />
  );

  const taxTipCard = (
    <Paper style={styles.card}>
      <View style={styles.controlRow}>
        <Text style={styles.controlLabel}>Tax</Text>
        {modeToggle(taxMode, switchTaxMode, 'Tax')}
        <TextInput
          style={styles.controlInput}
          keyboardType="decimal-pad"
          value={taxInput}
          onChangeText={onTaxChange}
          placeholder={taxMode === 'percent' ? String(savedTax.taxRatePercent) : '0.00'}
          placeholderTextColor={colors.muted}
          accessibilityLabel={taxMode === 'percent' ? 'Tax percent' : 'Tax amount'}
        />
      </View>
      {(fromReceipt || !onSavedRate) && (
        <View style={styles.taxNote}>
          <Text style={[text.hint, styles.flex1]}>
            {fromReceipt ? 'From the receipt · this bill only' : 'This bill only'}
          </Text>
          <Pressable onPress={revertToSavedRate} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.smallLink}>
              Use {savedState?.code ?? savedTax.stateCode} {savedTax.taxRatePercent}%
            </Text>
          </Pressable>
        </View>
      )}
      <DashedRule />
      <View style={styles.controlRow}>
        <Text style={styles.controlLabel}>Tip</Text>
        {modeToggle(bill.tipMode, setTipMode, 'Tip')}
        <TextInput
          style={styles.controlInput}
          keyboardType="decimal-pad"
          value={tipInput}
          onChangeText={onTipChange}
          placeholder={bill.tipMode === 'percent' ? '18' : '10.00'}
          placeholderTextColor={colors.muted}
          accessibilityLabel={bill.tipMode === 'percent' ? 'Tip percent' : 'Tip amount'}
        />
      </View>
    </Paper>
  );

  const receiptCard = (
    <Paper style={[styles.card, styles.receipt]}>
      <View style={styles.receiptHead}>
        <Text style={styles.receiptTitle}>{restaurant.trim() || 'This bill'}</Text>
        <Text style={text.label}>
          {dateLabel} · {guests} {guests === 1 ? 'guest' : 'guests'}
        </Text>
      </View>
      <DashedRule />
      {result.rows.map((row) => (
        <Pressable
          key={row.personId}
          onPress={() => navigation.navigate('PersonItems', { personId: row.personId })}
          accessibilityRole="button"
          accessibilityHint="Edit their items"
          style={({ pressed }) => [styles.personBlock, pressed && { opacity: 0.6 }]}
        >
          <Leader label={row.name} value={row.total.toFixed(2)} size="lg" bold />
          {itemsSummary(bill, row.personId) !== '' && (
            <Text style={text.hint}>{itemsSummary(bill, row.personId)}</Text>
          )}
          <Text style={styles.breakdown}>
            Items {row.subtotal.toFixed(2)} + tax {row.tax.toFixed(2)} + tip {row.tip.toFixed(2)}
          </Text>
        </Pressable>
      ))}
      <DashedRule />
      <View style={styles.totals}>
        <Leader label="Subtotal" value={result.grandSubtotal.toFixed(2)} size="sm" />
        <Leader
          label={taxMode === 'percent' ? `Tax ${bill.taxRatePercent}%` : 'Tax'}
          value={result.grandTax.toFixed(2)}
          size="sm"
        />
        <Leader
          label={bill.tipMode === 'percent' ? `Tip ${bill.tipValue}%` : 'Tip'}
          value={result.grandTip.toFixed(2)}
          size="sm"
        />
        <Leader label="Total" value={result.grandTotal.toFixed(2)} size="xl" bold style={styles.grand} />
      </View>
      {printedTotal !== undefined ? (
        scanMatches ? (
          <Stamp label="Matches receipt ✓" rotate={-6} size={14} style={styles.matchStamp} />
        ) : (
          <Text style={styles.offText}>
            Receipt says {printedTotal.toFixed(2)}
            {bill.scan?.tip === undefined ? ' before tip' : ''} · off by{' '}
            {Math.abs((ourComparable ?? 0) - printedTotal).toFixed(2)}
          </Text>
        )
      ) : (
        <View style={styles.verify}>
          <Text style={text.label}>Receipt total (to check)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={expected}
            onChangeText={setExpected}
            placeholder="e.g. 124.50"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Receipt total to check against"
          />
          {diff !== null &&
            (matches ? (
              <Stamp label="Matches receipt ✓" rotate={-4} size={13} />
            ) : (
              <Text style={styles.offText}>
                Off by {Math.abs(diff).toFixed(2)} ({diff > 0 ? 'ours is higher' : 'ours is lower'})
              </Text>
            ))}
        </View>
      )}
    </Paper>
  );

  const saveCard = (
    <Paper style={styles.card}>
      <Text style={styles.cardTitle}>{isEditing ? 'Receipt details' : 'Save this receipt'}</Text>
      {!isEditing && <Text style={text.hint}>Optional. Keeps a copy on this phone.</Text>}
      <View style={styles.field}>
        <Text style={text.label}>Restaurant</Text>
        <TextInput
          style={styles.input}
          value={restaurant}
          onChangeText={setRestaurant}
          placeholder="Optional"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          accessibilityLabel="Restaurant"
        />
      </View>
      <View style={styles.field}>
        <Text style={text.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          placeholderTextColor={colors.muted}
          multiline
          accessibilityLabel="Notes"
        />
      </View>
      <View style={styles.dateRow}>
        <Text style={text.label}>Date</Text>
        <Pressable
          onPress={() => setDatePickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Date, ${formatPickerLabel(receiptDate)}. Change`}
          style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.dateText}>{dateLabel} · </Text>
          <Text style={styles.smallLink}>Change</Text>
        </Pressable>
      </View>
      <Text style={text.label}>Which one was you?</Text>
      <View style={styles.chips}>
        {bill.people.map((p) => {
          const on = ownerPersonId === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setOwnerPersonId(on ? undefined : p.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <PaperButton title={isEditing ? 'Save changes' : 'Save receipt'} onPress={onSave} style={styles.saveBtn} />
    </Paper>
  );

  const resetButton = isEditing ? (
    <PaperButton title="Cancel edit" variant="danger" compact onPress={() => navigation.goBack()} />
  ) : (
    <PaperButton title="Start new bill" variant="danger" compact onPress={confirmReset} />
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {wide ? (
          <View style={styles.columns}>
            <View style={styles.leftColumn}>
              {editBanner}
              {receiptCard}
            </View>
            <View style={styles.rightColumn}>
              {taxTipCard}
              {saveCard}
              {resetButton}
            </View>
          </View>
        ) : (
          <Column style={styles.stack}>
            {editBanner}
            {taxTipCard}
            {receiptCard}
            {saveCard}
            {resetButton}
          </Column>
        )}
      </ScrollView>

      <Modal
        visible={datePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setDatePickerOpen(false)}
          accessibilityLabel="Close date picker"
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.cardTitle}>Receipt date</Text>
            <Calendar
              current={ymdLocal(receiptDate)}
              initialDate={ymdLocal(receiptDate)}
              markedDates={{
                [ymdLocal(receiptDate)]: { selected: true, selectedColor: colors.ink },
              }}
              onDayPress={(d: DateData) => {
                setReceiptDate(new Date(d.year, d.month - 1, d.day));
                setDatePickerOpen(false);
              }}
              theme={calendarTheme}
            />
            <PaperButton
              title="Today"
              variant="outline"
              compact
              onPress={() => {
                setReceiptDate(new Date());
                setDatePickerOpen(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  flex1: { flex: 1 },
  container: { padding: 20, paddingTop: 8, paddingBottom: 40 },
  stack: { gap: 16 },
  columns: { flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
  leftColumn: { flex: 1, gap: 16, minWidth: 0 },
  rightColumn: { width: 380, gap: 16 },
  headerLink: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  card: { gap: 12 },
  cardTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 15,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  controlLabel: {
    width: 40,
    fontFamily: fonts.monoBold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  toggle: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.ink },
  toggleBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  toggleBtnOn: { backgroundColor: colors.ink },
  toggleText: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.ink },
  toggleTextOn: { color: colors.paper },
  controlInput: {
    flex: 1,
    height: 47,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    fontFamily: fonts.monoBold,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  taxNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 50 },
  smallLink: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.ink,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
  },
  receipt: { paddingVertical: 22, gap: 14 },
  receiptHead: { alignItems: 'center', gap: 4 },
  receiptTitle: { ...text.title, textAlign: 'center' },
  personBlock: { gap: 4 },
  breakdown: { ...text.label, fontSize: 11, letterSpacing: 0.5 },
  totals: { gap: 6 },
  grand: { marginTop: 6 },
  matchStamp: { alignSelf: 'flex-end' },
  offText: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.warn,
    textTransform: 'uppercase',
  },
  verify: { gap: 8 },
  field: { gap: 6 },
  input: {
    ...text.input,
    height: 46,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
  },
  notes: { height: 72, paddingTop: 10, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  dateText: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 44, paddingHorizontal: 14, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderWidth: 1.5, borderColor: colors.ink },
  chipOff: { backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.faint, borderStyle: 'dashed' },
  chipText: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  chipTextOn: { color: colors.paper },
  saveBtn: { marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: colors.paper,
    padding: 14,
    gap: 10,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
});
