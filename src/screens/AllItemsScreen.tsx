import React, { useMemo, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReceiptPhoto from '../components/ReceiptPhoto';
import ReceiptView, { TotalLine } from '../components/ReceiptView';
import { useBill } from '../context/BillContext';
import { ScreenProps } from '../types/navigation';
import { ScannedAssignment } from '../types/scan';
import { calculateBreakdown } from '../utils/calculate';
import { MAX_ITEM_NAME, parsePrice, priceError } from '../utils/money';
import { ReceiptRow, rowsFromBill } from '../utils/receiptRows';

// Matches the quantity stepper's cap on the other item screens.
const MAX_QTY = 20;

export default function AllItemsScreen({}: ScreenProps<'AllItems'>) {
  const { bill, scanPhotoUri, changeLine } = useBill();
  const insets = useSafeAreaInsets();
  // undefined = closed, null = adding a new item, a row = editing that row.
  const [editing, setEditing] = useState<ReceiptRow | null | undefined>(undefined);
  const [photoOpen, setPhotoOpen] = useState(false);

  const rows = useMemo(() => rowsFromBill(bill), [bill]);
  const result = useMemo(() => calculateBreakdown(bill), [bill]);
  const scan = bill.scan;
  const unassignedLines = rows.filter((r) => r.unassigned > 0).length;

  // With no tip written on the receipt, its total is pre-tip — compare like
  // with like rather than flag the tip the user added here as a mismatch.
  const totals: TotalLine[] = [
    {
      label: 'Subtotal',
      value: result.grandSubtotal,
      printed: scan?.subtotal !== undefined ? { label: 'Receipt', value: scan.subtotal } : undefined,
    },
    {
      label: `Tax (${bill.taxRatePercent}%)`,
      value: result.grandTax,
      printed: scan?.tax !== undefined ? { label: 'Receipt', value: scan.tax } : undefined,
    },
    ...(scan?.total !== undefined && scan.tip === undefined
      ? [
          {
            label: 'Total before tip',
            value: result.grandSubtotal + result.grandTax,
            printed: { label: 'Receipt total', value: scan.total },
          },
        ]
      : []),
    {
      label: 'Tip',
      value: result.grandTip,
      printed: scan?.tip !== undefined ? { label: 'Receipt', value: scan.tip } : undefined,
    },
    {
      label: 'Total',
      value: result.grandTotal,
      bold: true,
      printed:
        scan?.total !== undefined && scan.tip !== undefined
          ? { label: 'Receipt', value: scan.total }
          : undefined,
    },
  ];

  const saveRow = (row: ReceiptRow | null, edit: LineEdit) => {
    const lineId = row?.lineId;
    const unit = { name: edit.name, price: edit.price, lineId };
    const add: ScannedAssignment[] = [];
    if (edit.mode === 'pick') {
      if (edit.personIds.length > 0) {
        for (let i = 0; i < edit.quantity; i++) add.push({ ...unit, personIds: edit.personIds });
      }
    } else {
      for (const [personId, n] of Object.entries(edit.counts)) {
        for (let i = 0; i < n; i++) add.push({ ...unit, personIds: [personId] });
      }
    }
    changeLine({
      remove: row?.refs ?? [],
      add,
      scanLine: lineId
        ? { id: lineId, next: { id: lineId, name: edit.name, price: edit.price, quantity: edit.quantity } }
        : undefined,
    });
    setEditing(undefined);
  };

  const removeRow = (row: ReceiptRow) => {
    changeLine({
      remove: row.refs,
      add: [],
      scanLine: row.lineId ? { id: row.lineId, next: null } : undefined,
    });
    setEditing(undefined);
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {unassignedLines > 0 && (
          <View style={styles.alert}>
            <Text style={styles.alertText}>
              {unassignedLines} line{unassignedLines === 1 ? ' isn’t' : 's aren’t'} fully assigned —
              tap {unassignedLines === 1 ? 'it' : 'one'} to say who had it.
            </Text>
          </View>
        )}
        <ReceiptView
          title={scan?.restaurantName}
          rows={rows}
          people={bill.people}
          totals={totals}
          onPressRow={(row) => setEditing(row)}
        />
        {rows.length > 0 && <Text style={styles.hint}>Tap a line to fix it.</Text>}
        {scanPhotoUri && (
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPhotoOpen(true)}>
            <Text style={styles.secondaryBtnText}>View receipt photo</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, bill.people.length === 0 && styles.btnDisabled]}
          disabled={bill.people.length === 0}
          onPress={() => setEditing(null)}
        >
          <Text style={styles.primaryBtnText}>+ Add a missing item</Text>
        </TouchableOpacity>
      </View>

      {editing !== undefined && (
        <LineEditor
          key={editing?.key ?? 'new'}
          row={editing}
          onClose={() => setEditing(undefined)}
          onSave={(edit) => saveRow(editing, edit)}
          onRemove={editing ? () => removeRow(editing) : undefined}
        />
      )}

      {scanPhotoUri && (
        <ReceiptPhoto uri={scanPhotoUri} visible={photoOpen} onClose={() => setPhotoOpen(false)} />
      )}
    </View>
  );
}

/**
 * What the editor hands back. 'pick' = one set of people shares every unit
 * (or one person has them all); 'units' = units handed out per person.
 */
type LineEdit = {
  name: string;
  price: number;
  quantity: number;
  mode: 'pick' | 'units';
  personIds: string[];
  counts: Record<string, number>;
};

/** Same controls as AssignItems, for one line at a time. */
function LineEditor({
  row,
  onClose,
  onSave,
  onRemove,
}: {
  row: ReceiptRow | null;
  onClose: () => void;
  onSave: (edit: LineEdit) => void;
  onRemove?: () => void;
}) {
  const { bill } = useBill();
  const insets = useSafeAreaInsets();
  const ownerIds = Object.keys(row?.owned ?? {});
  const sharedOnly = !!row && row.shared.length === 1 && ownerIds.length === 0;

  const [name, setName] = useState(row?.name ?? '');
  const [priceText, setPriceText] = useState(row ? row.price.toFixed(2) : '');
  const [quantity, setQuantity] = useState(row?.quantity ?? 1);
  const [shareEvenly, setShareEvenly] = useState(sharedOnly && (row?.quantity ?? 1) > 1);
  const [personIds, setPersonIds] = useState<string[]>(
    sharedOnly ? row!.shared[0].personIds : row?.quantity === 1 ? ownerIds : [],
  );
  const [counts, setCounts] = useState<Record<string, number>>(row?.owned ?? {});

  const price = parsePrice(priceText);
  const priceValid = !isNaN(price);
  const priceWarning = priceError(priceText);
  const mode: LineEdit['mode'] = quantity === 1 || shareEvenly ? 'pick' : 'units';
  const handedOut = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const unitsLeft = quantity - handedOut;
  const anyoneAssigned = mode === 'pick' ? personIds.length > 0 : handedOut > 0;
  // A hand-entered item with no owner would vanish; a scanned line can stay
  // on the receipt unassigned.
  const valid = name.trim().length > 0 && priceValid && (anyoneAssigned || !!row?.lineId);

  const changeQuantity = (next: number) => {
    const q = Math.max(1, Math.min(MAX_QTY, next));
    if (quantity === 1 && q > 1 && personIds.length === 1 && handedOut === 0) {
      setCounts({ [personIds[0]]: 1 });
    }
    // Fewer units than already handed out: start over rather than guess.
    if (q < handedOut) setCounts({});
    setQuantity(q);
  };

  const togglePerson = (id: string) =>
    setPersonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const changeUnits = (id: string, delta: number) => {
    if (delta > 0 && unitsLeft <= 0) return;
    setCounts((prev) => {
      const n = Math.max(0, (prev[id] ?? 0) + delta);
      const next = { ...prev };
      if (n === 0) delete next[id];
      else next[id] = n;
      return next;
    });
  };
  const allIds = bill.people.map((p) => p.id);
  const everyone = () => setPersonIds(personIds.length === allIds.length ? [] : allIds);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex0} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.sheetContent}
          >
            <Text style={styles.sheetTitle}>{row ? 'Edit line' : 'Add a missing item'}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Item name"
              autoCapitalize="words"
              maxLength={MAX_ITEM_NAME}
            />
            <View style={styles.priceRow}>
              <TextInput
                style={[styles.input, styles.flex0]}
                value={priceText}
                onChangeText={setPriceText}
                placeholder={quantity > 1 ? 'Price each' : 'Price'}
                keyboardType="decimal-pad"
              />
              <View style={styles.qtyBox}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => changeQuantity(quantity - 1)}
                  disabled={quantity <= 1}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => changeQuantity(quantity + 1)}
                  disabled={quantity >= MAX_QTY}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            {priceWarning && <Text style={styles.warn}>{priceWarning}</Text>}
            {priceValid && quantity > 1 && (
              <Text style={styles.note}>
                ${price.toFixed(2)} each · ${(price * quantity).toFixed(2)} for the line
              </Text>
            )}

            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>{quantity > 1 ? 'Who had them?' : 'Who had it?'}</Text>
              {mode === 'units' ? (
                <Text style={[styles.leftText, unitsLeft === 0 && styles.leftTextDone]}>
                  {unitsLeft === 0 ? 'All assigned' : `${unitsLeft} of ${quantity} left`}
                </Text>
              ) : (
                <TouchableOpacity onPress={everyone} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.link}>
                    {personIds.length === allIds.length ? 'Clear all' : 'Everyone'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.chipRow}>
              {bill.people.map((p) => {
                const mine = counts[p.id] ?? 0;
                const on = mode === 'units' ? mine > 0 : personIds.includes(p.id);
                return (
                  <View key={p.id} style={[styles.chip, on && styles.chipOn]}>
                    {mode === 'units' && mine > 0 && (
                      <TouchableOpacity
                        style={styles.minusBtn}
                        onPress={() => changeUnits(p.id, -1)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                      >
                        <Text style={styles.minusText}>−</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.chipMain}
                      onPress={() => (mode === 'units' ? changeUnits(p.id, 1) : togglePerson(p.id))}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {mode === 'units' && mine > 0 ? `${p.name} × ${mine}` : p.name}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            {mode === 'units' && <Text style={styles.note}>Tap a name once for each one they had.</Text>}
            {mode === 'pick' && personIds.length > 1 && priceValid && (
              <Text style={styles.note}>
                Split {personIds.length} ways · ${((price * quantity) / personIds.length).toFixed(2)} each
              </Text>
            )}
            {quantity > 1 && (
              <TouchableOpacity onPress={() => setShareEvenly((v) => !v)}>
                <Text style={styles.link}>
                  {shareEvenly
                    ? 'Hand them out one at a time instead'
                    : `Share all ${quantity} evenly instead`}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, !valid && styles.btnDisabled]}
              disabled={!valid}
              onPress={() => onSave({ name: name.trim(), price, quantity, mode, personIds, counts })}
            >
              <Text style={styles.primaryBtnText}>{row ? 'Save' : 'Add item'}</Text>
            </TouchableOpacity>
            {onRemove && (
              <TouchableOpacity style={styles.deleteBtn} onPress={onRemove}>
                <Text style={styles.deleteBtnText}>Remove line</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F4F6F5' },
  flex0: { flex: 1 },
  scroll: { padding: 16, gap: 12 },
  alert: { backgroundColor: '#FFF8E1', borderRadius: 8, padding: 12 },
  alertText: { fontSize: 13, color: '#7A5C00', fontWeight: '600' },
  hint: { fontSize: 12, color: '#999', fontStyle: 'italic', textAlign: 'center' },
  secondaryBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3AB795',
    backgroundColor: '#fff',
  },
  secondaryBtnText: { color: '#3AB795', fontWeight: '600' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  primaryBtn: {
    backgroundColor: '#3AB795',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
  },
  sheetContent: { padding: 16, gap: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  priceRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  qtyBtnText: { fontSize: 18, fontWeight: '600', color: '#3AB795' },
  qtyValue: { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  note: { fontSize: 13, color: '#666' },
  warn: { fontSize: 13, color: '#c62828' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#444' },
  leftText: { color: '#c77700', fontWeight: '600' },
  leftTextDone: { color: '#3AB795' },
  link: { color: '#3AB795', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: '#f0f0f0' },
  chipMain: { paddingHorizontal: 12, paddingVertical: 8 },
  minusBtn: { paddingLeft: 10, paddingRight: 2, paddingVertical: 8 },
  minusText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  chipOn: { backgroundColor: '#3AB795' },
  chipText: { color: '#333', fontSize: 14 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#c62828',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteBtnText: { color: '#c62828', fontWeight: '600' },
});
