import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Column, DashedRule, NameChip as Chip, PaperButton, Stepper, TornEdge } from '../components/paper';
import ReceiptPhoto from '../components/ReceiptPhoto';
import ReceiptView, { AllAssignedStamp, TotalLine } from '../components/ReceiptView';
import { useBill } from '../context/BillContext';
import { colors, fonts, text } from '../theme';
import { ScreenProps } from '../types/navigation';
import { LineMode, ScannedAssignment } from '../types/scan';
import {
  countsFromUnits,
  resizeUnits,
  unitsFromCounts,
  unitsFromShared,
} from '../utils/assignProgress';
import { calculateBreakdown, describeTax, round2 } from '../utils/calculate';
import { MAX_ITEM_NAME, parsePrice, priceError } from '../utils/money';
import { ReceiptRow, rowsFromBill } from '../utils/receiptRows';

// Matches the quantity stepper's cap on the other item screens.
const MAX_QTY = 20;

export default function AllItemsScreen({ navigation }: ScreenProps<'AllItems'>) {
  const { bill, scanPhotoUri, changeLine } = useBill();
  const insets = useSafeAreaInsets();
  // undefined = closed, null = adding a new item, a row = editing that row.
  const [editing, setEditing] = useState<ReceiptRow | null | undefined>(undefined);
  const [photoOpen, setPhotoOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: scanPhotoUri
        ? () => (
            <Pressable
              onPress={() => setPhotoOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="View receipt photo"
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.headerLink}>Photo</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, scanPhotoUri]);

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
      label: bill.taxMode === 'amount' ? 'Tax' : `Tax ${describeTax(bill)}`,
      value: result.grandTax,
      printed: scan?.tax !== undefined ? { label: 'Receipt', value: scan.tax } : undefined,
    },
    ...(scan?.total !== undefined && scan.tip === undefined
      ? [
          {
            label: 'Before tip',
            value: round2(result.grandSubtotal + result.grandTax),
            printed: { label: 'Receipt total', value: scan.total },
          },
        ]
      : []),
    {
      label: bill.tipMode === 'percent' ? `Tip ${bill.tipValue}%` : 'Tip',
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
    const add: ScannedAssignment[] = unitsOfEdit(edit)
      .filter((ids) => ids.length > 0)
      .map((personIds) => ({ name: edit.name, price: edit.price, lineId, personIds }));
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
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Column style={styles.stack}>
          {unassignedLines > 0 && (
            <View style={styles.alert} accessibilityRole="alert">
              <Text style={styles.alertText}>
                {unassignedLines} line{unassignedLines === 1 ? " isn't" : "s aren't"} fully assigned
              </Text>
              <Text style={text.hint}>Tap {unassignedLines === 1 ? 'it' : 'one'} to say who had it.</Text>
            </View>
          )}
          <View>
            <ReceiptView
              title={scan?.restaurantName || 'This bill'}
              subtitle={rows.length > 0 ? 'Tap a line to fix it' : undefined}
              rows={rows}
              people={bill.people}
              totals={totals}
              onPressRow={(row) => setEditing(row)}
              footer={<AllAssignedStamp rows={rows} />}
            />
            <TornEdge />
          </View>
        </Column>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
        <Column>
          <PaperButton
            title="+ Add a missing item"
            disabled={bill.people.length === 0}
            onPress={() => setEditing(null)}
          />
        </Column>
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

/** What the editor hands back. See LineMode for the three ways to hand out units. */
type LineEdit = {
  name: string;
  price: number;
  quantity: number;
  mode: LineMode;
  personIds: string[];
  counts: Record<string, number>;
  units: string[][];
};

const unitsOfEdit = (e: LineEdit): string[][] =>
  e.quantity === 1 || e.mode === 'all'
    ? unitsFromShared(e.quantity, e.personIds)
    : e.mode === 'each'
      ? unitsFromCounts(e.quantity, e.counts)
      : resizeUnits(e.units, e.quantity);

/** Start the editor in the mode that shows this row exactly as it is. */
const initialAssignment = (row: ReceiptRow | null) => {
  if (!row) return { mode: 'each' as LineMode, personIds: [] as string[], counts: {}, units: [] as string[][] };
  const owned = Object.entries(row.owned).flatMap(([id, n]) => Array.from({ length: n }, () => [id]));
  const shared = row.shared.flatMap((g) => Array.from({ length: g.units }, () => [...g.personIds]));
  const units = resizeUnits([...owned, ...shared], row.quantity);
  const counts = { ...row.owned };
  const onlyOneGroup =
    owned.length === 0 && row.shared.length === 1 && row.shared[0].units === row.quantity;
  const mode: LineMode =
    row.quantity === 1 || onlyOneGroup ? 'all' : row.shared.length === 0 ? 'each' : 'units';
  return { mode, personIds: [...new Set(units.flat())], counts, units };
};

const MODE_LABELS: Record<LineMode, string> = {
  each: 'One each',
  all: 'All shared',
  units: 'Some shared',
};

/** Same choices as AssignItems, for one line at a time. */
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
  const [init] = useState(() => initialAssignment(row));

  const [name, setName] = useState(row?.name ?? '');
  const [priceText, setPriceText] = useState(row ? row.price.toFixed(2) : '');
  const [quantity, setQuantity] = useState(row?.quantity ?? 1);
  const [mode, setMode] = useState<LineMode>(init.mode);
  const [personIds, setPersonIds] = useState<string[]>(init.personIds);
  const [counts, setCounts] = useState<Record<string, number>>(init.counts);
  const [units, setUnits] = useState<string[][]>(init.units);

  const price = parsePrice(priceText);
  const priceValid = !isNaN(price);
  const priceWarning = priceError(priceText);
  const effectiveMode: LineMode = quantity === 1 ? 'all' : mode;
  const edit: LineEdit = { name: name.trim(), price, quantity, mode: effectiveMode, personIds, counts, units };
  const assigned = unitsOfEdit(edit);
  const unassigned = assigned.filter((u) => u.length === 0).length;
  const handedOut = quantity - unitsFromCounts(quantity, counts).filter((u) => u.length === 0).length;
  // A hand-entered item with no owner would vanish; a scanned line can stay
  // on the receipt unassigned.
  const valid = name.trim().length > 0 && priceValid && (unassigned < quantity || !!row?.lineId);

  const changeQuantity = (next: number) => {
    const q = Math.max(1, Math.min(MAX_QTY, next));
    // Fewer units than already handed out one each: start over rather than guess.
    if (q < handedOut) setCounts({});
    setQuantity(q);
  };

  const switchMode = (to: LineMode) => {
    if (to === effectiveMode) return;
    if (to === 'units') setUnits(assigned);
    else if (to === 'each') {
      setCounts(
        effectiveMode === 'units'
          ? countsFromUnits(assigned)
          : personIds.length === 1
            ? { [personIds[0]]: quantity }
            : {},
      );
    } else setPersonIds([...new Set(assigned.flat())]);
    setMode(to);
  };

  const togglePerson = (id: string) =>
    setPersonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const changeCount = (id: string, delta: number) => {
    if (delta > 0 && handedOut >= quantity) return;
    setCounts((prev) => {
      const n = Math.max(0, (prev[id] ?? 0) + delta);
      const next = { ...prev };
      if (n === 0) delete next[id];
      else next[id] = n;
      return next;
    });
  };
  const toggleUnitPerson = (unit: number, id: string) =>
    setUnits((prev) => {
      const next = resizeUnits(prev, quantity).map((ids) => [...ids]);
      next[unit] = next[unit].includes(id) ? next[unit].filter((x) => x !== id) : [...next[unit], id];
      return next;
    });
  const allIds = bill.people.map((p) => p.id);
  const everyone = () => setPersonIds(personIds.length === allIds.length ? [] : allIds);

  const status =
    unassigned === 0
      ? effectiveMode === 'all' && personIds.length > 1 && priceValid
        ? `Split ${personIds.length} ways · ${((price * quantity) / personIds.length).toFixed(2)} each`
        : 'All assigned'
      : `${unassigned} of ${quantity} not assigned`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex0} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.sheetContent}
          >
            <Column style={styles.sheetStack}>
              <Text style={styles.sheetTitle}>{row ? 'Edit line' : 'Add a missing item'}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Item name"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                maxLength={MAX_ITEM_NAME}
                accessibilityLabel="Item name"
              />
              <View style={styles.priceRow}>
                <TextInput
                  style={[styles.input, styles.flex0]}
                  value={priceText}
                  onChangeText={setPriceText}
                  placeholder={quantity > 1 ? 'Price each' : 'Price'}
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  accessibilityLabel={quantity > 1 ? 'Price each' : 'Price'}
                />
                <Stepper value={quantity} onChange={changeQuantity} label="Quantity" max={MAX_QTY} />
              </View>
              {priceWarning && <Text style={styles.danger}>{priceWarning}</Text>}

              <DashedRule />

              {quantity > 1 && (
                <View style={styles.segment}>
                  {(['each', 'all', 'units'] as const).map((m) => {
                    const on = effectiveMode === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => switchMode(m)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[styles.segmentBtn, on && styles.segmentBtnOn]}
                      >
                        <Text
                          style={[styles.segmentText, on && styles.segmentTextOn]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {MODE_LABELS[m]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {effectiveMode === 'all' && (
                <>
                  <View style={styles.rowBetween}>
                    <Text style={text.label}>{quantity > 1 ? 'Who shared them?' : 'Who had it?'}</Text>
                    <Pressable onPress={everyone} accessibilityRole="button" hitSlop={8}>
                      <Text style={styles.smallLink}>
                        {personIds.length === allIds.length ? 'Clear all' : 'Everyone'}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.chips}>
                    {bill.people.map((p) => (
                      <Chip key={p.id} name={p.name} on={personIds.includes(p.id)} onPress={() => togglePerson(p.id)} />
                    ))}
                  </View>
                </>
              )}

              {effectiveMode === 'each' &&
                bill.people.map((p) => (
                  <View key={p.id} style={styles.countRow}>
                    <Text style={styles.countName}>{p.name}</Text>
                    <Stepper
                      value={counts[p.id] ?? 0}
                      min={0}
                      max={(counts[p.id] ?? 0) + (quantity - handedOut)}
                      onChange={(n) => changeCount(p.id, n - (counts[p.id] ?? 0))}
                      label={`How many ${p.name} had`}
                    />
                  </View>
                ))}

              {effectiveMode === 'units' &&
                resizeUnits(units, quantity).map((ids, unit) => (
                  <View key={unit} style={styles.unitBlock}>
                    <Text style={text.label}>
                      {name.trim() || 'Item'} {unit + 1} of {quantity}
                    </Text>
                    <View style={styles.chips}>
                      {bill.people.map((p) => (
                        <Chip
                          key={p.id}
                          name={p.name}
                          on={ids.includes(p.id)}
                          onPress={() => toggleUnitPerson(unit, p.id)}
                        />
                      ))}
                    </View>
                  </View>
                ))}

              <Text style={unassigned === 0 ? styles.ok : styles.warnText}>{status}</Text>

              <PaperButton
                title={row ? 'Save' : 'Add item'}
                disabled={!valid}
                onPress={() => onSave(edit)}
              />
              {onRemove && (
                <PaperButton title="Remove line" variant="danger" compact onPress={onRemove} />
              )}
            </Column>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  flex0: { flex: 1 },
  scroll: { padding: 20, paddingTop: 8 },
  stack: { gap: 12 },
  headerLink: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  alert: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.warn, padding: 12, gap: 2 },
  alertText: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 0.5,
    color: colors.warn,
    textTransform: 'uppercase',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    backgroundColor: colors.ground,
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.paper, maxHeight: '88%' },
  sheetContent: { padding: 18 },
  sheetStack: { gap: 12 },
  sheetTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    letterSpacing: 1.5,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  input: {
    ...text.input,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
  },
  priceRow: { flexDirection: 'row', gap: 8 },
  danger: { ...text.hint, color: colors.danger },
  segment: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.ink },
  segmentBtn: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentBtnOn: { backgroundColor: colors.ink },
  segmentText: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  segmentTextOn: { color: colors.paper },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallLink: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.ink,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countName: {
    fontFamily: fonts.monoBold,
    fontSize: 15,
    color: colors.ink,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  unitBlock: { gap: 8 },
  ok: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.stamp, textTransform: 'uppercase' },
  warnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.warn, textTransform: 'uppercase' },
});
