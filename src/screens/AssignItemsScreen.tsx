import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import ReceiptView from '../components/ReceiptView';
import { useBill } from '../context/BillContext';
import { AssignDraft, AssignProgress } from '../types/scan';
import { ScreenProps } from '../types/navigation';
import { forPeople, progressToBill } from '../utils/assignProgress';
import { MAX_ITEM_NAME, parsePrice, priceError } from '../utils/money';
import { rowsFromProgress } from '../utils/receiptRows';

type Draft = AssignDraft;

// Matches the quantity stepper's cap on the manual item screens.
const MAX_QTY = 20;

export default function AssignItemsScreen({ navigation, route }: ScreenProps<'AssignItems'>) {
  const { bill, applyScannedItems, pendingScan, setPendingScan } = useBill();
  const insets = useSafeAreaInsets();

  // Resume where the user left off if they backed out mid-way (say, to add a
  // forgotten person); otherwise start fresh from the scan.
  const [initial] = useState<AssignProgress>(() => {
    const saved = pendingScan?.progress;
    if (saved) return forPeople(saved, new Set(bill.people.map((p) => p.id)));
    return {
      drafts: route.params.items.map((i) => ({
        id: i.id,
        name: i.name,
        priceText: i.price.toFixed(2),
        quantity: i.quantity,
      })),
      index: 0,
      assignments: {},
      unitCounts: {},
      shareEvenly: {},
      skipped: {},
    };
  });
  const [drafts, setDrafts] = useState<Draft[]>(initial.drafts);
  const [index, setIndex] = useState(initial.index);
  const [assignments, setAssignments] = useState(initial.assignments);
  const [unitCounts, setUnitCounts] = useState(initial.unitCounts);
  const [shareEvenly, setShareEvenly] = useState(initial.shareEvenly);
  const [skipped, setSkipped] = useState(initial.skipped);

  // Mirror every change onto the pending scan. Once the scan is committed (or
  // replaced) there's nothing to mirror onto, so this becomes a no-op.
  useEffect(() => {
    const progress: AssignProgress = {
      drafts,
      index,
      assignments,
      unitCounts,
      shareEvenly,
      skipped,
    };
    setPendingScan((prev) => (prev?.result ? { ...prev, progress } : prev));
  }, [drafts, index, assignments, unitCounts, shareEvenly, skipped, setPendingScan]);

  const total = drafts.length;
  const current = drafts[index];
  const isLast = index === total - 1;
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `LINE ${Math.min(index + 1, total)} OF ${total}`,
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setSeeAllOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerLink}>See all</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, index, total]);

  const seeAllRows = useMemo(
    () => rowsFromProgress({ drafts, index, assignments, unitCounts, shareEvenly, skipped }),
    [drafts, index, assignments, unitCounts, shareEvenly, skipped],
  );

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
    const { entries, lines } = progressToBill({
      drafts,
      index,
      assignments,
      unitCounts,
      shareEvenly,
      skipped: finalSkipped,
    });
    applyScannedItems(entries, lines);

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

  const priceValue = parsePrice(current.priceText);
  const priceValid = !isNaN(priceValue);
  const priceWarning = priceError(current.priceText);
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
            maxLength={MAX_ITEM_NAME}
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
          {priceWarning && <Text style={styles.warn}>{priceWarning}</Text>}
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

      <Modal
        visible={seeAllOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSeeAllOpen(false)}
      >
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Whole receipt</Text>
            <TouchableOpacity
              onPress={() => setSeeAllOpen(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.headerLink}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.panelScroll}>
            <ReceiptView
              title={pendingScan?.result?.restaurantName}
              rows={seeAllRows}
              people={bill.people}
              highlightKey={current.id}
              onPressRow={(row) => {
                const i = drafts.findIndex((d) => d.id === row.key);
                if (i >= 0) setIndex(i);
                setSeeAllOpen(false);
              }}
              totals={[
                {
                  label: 'Assigned so far',
                  value: seeAllRows.reduce(
                    (sum, r) => sum + r.price * (r.quantity - r.unassigned),
                    0,
                  ),
                  bold: true,
                  printed:
                    pendingScan?.result?.subtotal !== undefined
                      ? { label: 'Receipt subtotal', value: pendingScan.result.subtotal }
                      : undefined,
                },
              ]}
            />
            <Text style={styles.panelHint}>Tap a line to jump to it.</Text>
            {pendingScan?.imageUri && (
              <TouchableOpacity style={styles.photoBtn} onPress={() => setPhotoOpen(true)}>
                <Text style={styles.link}>View receipt photo</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          {pendingScan?.imageUri && (
            <ReceiptPhoto
              uri={pendingScan.imageUri}
              visible={photoOpen}
              onClose={() => setPhotoOpen(false)}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  headerLink: { color: '#3AB795', fontWeight: '600', fontSize: 16 },
  panel: { flex: 1, backgroundColor: '#F4F6F5' },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  panelTitle: { fontSize: 17, fontWeight: '700' },
  panelScroll: { padding: 16, gap: 12 },
  panelHint: { fontSize: 12, color: '#999', fontStyle: 'italic', textAlign: 'center' },
  photoBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3AB795',
    backgroundColor: '#fff',
  },
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
