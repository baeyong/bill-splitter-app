import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBill } from '../context/BillContext';
import { ScannedAssignment } from '../types/scan';
import { ScreenProps } from '../types/navigation';

/** Price is kept as text while the user is editing so partial input works. */
type Draft = { id: string; name: string; priceText: string; quantity: number };

// Matches the quantity stepper's cap on the manual item screens.
const MAX_QTY = 20;

export default function AssignItemsScreen({ navigation, route }: ScreenProps<'AssignItems'>) {
  const { bill, applyScannedItems } = useBill();
  const insets = useSafeAreaInsets();

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    route.params.items.map((i) => ({
      id: i.id,
      name: i.name,
      priceText: i.price.toFixed(2),
      quantity: i.quantity,
    })),
  );
  const [index, setIndex] = useState(0);
  // Who shares a line: single-unit lines, and multi-unit lines the user chose
  // to share evenly.
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  // How many units of a multi-unit line each person had ("Alice 2, Bob 1").
  const [unitCounts, setUnitCounts] = useState<Record<string, Record<string, number>>>({});
  const [shareEvenly, setShareEvenly] = useState<Record<string, boolean>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});

  const total = drafts.length;
  const current = drafts[index];
  const isLast = index === total - 1;

  useLayoutEffect(() => {
    navigation.setOptions({ title: `Item ${Math.min(index + 1, total)} of ${total}` });
  }, [navigation, index, total]);

  // Running per-person counts, so the chips show progress as you go.
  const countsByPerson = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of drafts) {
      if (skipped[d.id]) continue;
      if (d.quantity > 1 && !shareEvenly[d.id]) {
        for (const [id, n] of Object.entries(unitCounts[d.id] ?? {})) {
          counts[id] = (counts[id] ?? 0) + n;
        }
      } else {
        for (const id of assignments[d.id] ?? []) counts[id] = (counts[id] ?? 0) + d.quantity;
      }
    }
    return counts;
  }, [drafts, assignments, unitCounts, shareEvenly, skipped]);

  if (bill.people.length === 0) {
    return (
      <View style={styles.flex}>
        <Text style={styles.empty}>Add people first, then scan a receipt.</Text>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.flex}>
        <Text style={styles.empty}>Nothing left to assign.</Text>
      </View>
    );
  }

  const perUnit = current.quantity > 1 && !shareEvenly[current.id];
  const selected = assignments[current.id] ?? [];
  const counts = unitCounts[current.id] ?? {};
  const assignedUnits = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const unitsLeft = current.quantity - assignedUnits;

  const setField = (patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const unskip = () => setSkipped((prev) => ({ ...prev, [current.id]: false }));

  const setQuantity = (quantity: number) => {
    const next = Math.max(1, Math.min(MAX_QTY, quantity));
    setField({ quantity: next });
    // Fewer units than are already handed out: start that line's counts over
    // rather than guess whose to take back.
    if (next < assignedUnits) {
      setUnitCounts((prev) => ({ ...prev, [current.id]: {} }));
    }
  };

  const togglePerson = (personId: string) => {
    unskip();
    setAssignments((prev) => {
      const currentIds = prev[current.id] ?? [];
      const next = currentIds.includes(personId)
        ? currentIds.filter((id) => id !== personId)
        : [...currentIds, personId];
      return { ...prev, [current.id]: next };
    });
  };

  const changeUnits = (personId: string, delta: number) => {
    if (delta > 0 && unitsLeft <= 0) return;
    unskip();
    setUnitCounts((prev) => {
      const line = { ...(prev[current.id] ?? {}) };
      const n = Math.max(0, (line[personId] ?? 0) + delta);
      if (n === 0) delete line[personId];
      else line[personId] = n;
      return { ...prev, [current.id]: line };
    });
  };

  const everyone = () => {
    const allIds = bill.people.map((p) => p.id);
    const alreadyAll = selected.length === allIds.length;
    unskip();
    setAssignments((prev) => ({ ...prev, [current.id]: alreadyAll ? [] : allIds }));
  };

  const toggleShareEvenly = () =>
    setShareEvenly((prev) => ({ ...prev, [current.id]: !prev[current.id] }));

  // Takes `skipped` explicitly: skipping the *last* item commits in the same
  // tick as the setState that records the skip, so `skipped` in scope is still
  // the pre-skip value.
  const commit = (finalSkipped: Record<string, boolean> = skipped) => {
    // Each unit becomes its own entry — the same shape the manual quantity
    // stepper produces.
    const entries: ScannedAssignment[] = [];
    for (const draft of drafts) {
      if (finalSkipped[draft.id]) continue;
      const price = parseFloat(draft.priceText);
      if (isNaN(price) || price < 0) continue;
      const name = draft.name.trim();

      if (draft.quantity > 1 && !shareEvenly[draft.id]) {
        for (const [personId, n] of Object.entries(unitCounts[draft.id] ?? {})) {
          for (let i = 0; i < n; i++) entries.push({ name, price, personIds: [personId] });
        }
      } else {
        const personIds = assignments[draft.id] ?? [];
        if (personIds.length === 0) continue;
        for (let i = 0; i < draft.quantity; i++) entries.push({ name, price, personIds });
      }
    }

    applyScannedItems(entries);

    // Land on Summary with a sensible back path rather than walking back
    // through the scan flow.
    navigation.reset({
      index: 2,
      routes: [{ name: 'Home' }, { name: 'People' }, { name: 'Summary' }],
    });
  };

  const goNext = () => {
    if (isLast) commit();
    else setIndex((i) => i + 1);
  };

  const skip = () => {
    const nextSkipped = { ...skipped, [current.id]: true };
    setSkipped(nextSkipped);
    // Clear the line so coming Back to it doesn't show stale picks that Next
    // would then silently drop.
    setAssignments((prev) => ({ ...prev, [current.id]: [] }));
    setUnitCounts((prev) => ({ ...prev, [current.id]: {} }));
    if (isLast) commit(nextSkipped);
    else setIndex((i) => i + 1);
  };

  const priceValue = parseFloat(current.priceText);
  const priceValid = !isNaN(priceValue) && priceValue >= 0;
  const lineTotal = priceValid ? priceValue * current.quantity : 0;
  const assignedEnough = perUnit ? unitsLeft === 0 : selected.length > 0;
  const canAdvance = assignedEnough && current.name.trim().length > 0 && priceValid;
  const perPerson = !perUnit && selected.length > 1 ? lineTotal / selected.length : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.itemCard}>
          <Text style={styles.fieldLabel}>Item</Text>
          <TextInput
            style={styles.nameInput}
            value={current.name}
            onChangeText={(name) => setField({ name })}
            placeholder="Item name"
            autoCapitalize="words"
          />
          <View style={styles.priceRow}>
            <View style={styles.flex}>
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                {current.quantity > 1 ? 'Price each' : 'Price'}
              </Text>
              <TextInput
                style={styles.priceInput}
                value={current.priceText}
                onChangeText={(priceText) => setField({ priceText })}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
            <View>
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Qty</Text>
              <View style={styles.qtyBox}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity(current.quantity - 1)}
                  disabled={current.quantity <= 1}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{current.quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity(current.quantity + 1)}
                  disabled={current.quantity >= MAX_QTY}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {!priceValid && current.priceText.length > 0 && (
            <Text style={styles.warn}>That doesn't look like a price.</Text>
          )}
          {priceValid && current.quantity > 1 && (
            <Text style={styles.lineTotal}>${lineTotal.toFixed(2)} total</Text>
          )}
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.sectionLabel}>
            {current.quantity > 1 ? 'Who had them?' : 'Who had this?'}
          </Text>
          {perUnit ? (
            <Text style={[styles.leftText, unitsLeft === 0 && styles.leftTextDone]}>
              {unitsLeft === 0 ? 'All assigned' : `${unitsLeft} of ${current.quantity} left`}
            </Text>
          ) : (
            <TouchableOpacity onPress={everyone}>
              <Text style={styles.link}>
                {selected.length === bill.people.length ? 'Clear all' : 'Everyone'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.chipRow}>
          {bill.people.map((p) => {
            const count = countsByPerson[p.id] ?? 0;
            const mine = counts[p.id] ?? 0;
            const isOn = perUnit ? mine > 0 : selected.includes(p.id);
            return (
              <View key={p.id} style={[styles.chip, isOn && styles.chipOn]}>
                {perUnit && mine > 0 && (
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
                  onPress={() => (perUnit ? changeUnits(p.id, 1) : togglePerson(p.id))}
                >
                  <Text style={[styles.chipText, isOn && styles.chipTextOn]}>
                    {perUnit && mine > 0 ? `${p.name} × ${mine}` : p.name}
                  </Text>
                  {count > 0 && (
                    <View style={[styles.badge, isOn && styles.badgeOn]}>
                      <Text style={[styles.badgeText, isOn && styles.badgeTextOn]}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {perUnit && <Text style={styles.splitNote}>Tap a name once for each one they had.</Text>}

        {perPerson !== null && (
          <Text style={styles.splitNote}>
            Split {selected.length} ways · ${perPerson.toFixed(2)} each
          </Text>
        )}

        {current.quantity > 1 && (
          <TouchableOpacity onPress={toggleShareEvenly} style={styles.modeBtn}>
            <Text style={styles.link}>
              {perUnit
                ? `Share all ${current.quantity} evenly instead`
                : 'Hand them out one at a time instead'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={skip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip this item</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity
          style={[styles.backBtn, index === 0 && styles.btnDisabled]}
          disabled={index === 0}
          onPress={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextBtn, !canAdvance && styles.btnDisabled]}
          disabled={!canAdvance}
          onPress={goNext}
        >
          <Text style={styles.nextBtnText}>{isLast ? 'Finish' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  empty: { color: '#999', textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
  progressTrack: { height: 3, backgroundColor: '#eee' },
  progressFill: { height: 3, backgroundColor: '#3AB795' },
  scroll: { padding: 16, paddingBottom: 24 },
  itemCard: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 16,
  },
  fieldLabel: { fontSize: 12, color: '#888', fontWeight: '600', textTransform: 'uppercase' },
  fieldLabelSpaced: { marginTop: 14 },
  nameInput: {
    fontSize: 22,
    fontWeight: '600',
    color: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 8,
  },
  priceInput: {
    fontSize: 22,
    fontWeight: '700',
    color: '#3AB795',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 8,
  },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginTop: 6,
  },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  qtyBtnText: { fontSize: 18, fontWeight: '600', color: '#3AB795' },
  qtyValue: { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#222' },
  lineTotal: { marginTop: 8, fontSize: 13, color: '#678' },
  warn: { color: '#c62828', fontSize: 13, marginTop: 8 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#222' },
  link: { color: '#3AB795', fontWeight: '600' },
  leftText: { color: '#c77700', fontWeight: '600' },
  leftTextDone: { color: '#3AB795' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  chipMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  minusBtn: { paddingLeft: 12, paddingRight: 2, paddingVertical: 10 },
  minusText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  chipOn: { backgroundColor: '#3AB795' },
  chipText: { color: '#333', fontSize: 15 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  badge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: '#ddd',
    alignItems: 'center',
  },
  badgeOn: { backgroundColor: 'rgba(255,255,255,0.3)' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#666' },
  badgeTextOn: { color: '#fff' },
  splitNote: { marginTop: 12, fontSize: 13, color: '#678' },
  modeBtn: { marginTop: 20, alignSelf: 'flex-start', paddingVertical: 4 },
  skipBtn: { marginTop: 28, alignSelf: 'center', padding: 8 },
  skipText: { color: '#999', fontSize: 14, textDecorationLine: 'underline' },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  backBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  backBtnText: { color: '#666', fontWeight: '600' },
  nextBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#3AB795',
  },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.4 },
});
