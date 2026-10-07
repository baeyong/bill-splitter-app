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
type Draft = { id: string; name: string; priceText: string };

export default function AssignItemsScreen({ navigation, route }: ScreenProps<'AssignItems'>) {
  const { bill, applyScannedItems } = useBill();
  const insets = useSafeAreaInsets();

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    route.params.items.map((i) => ({
      id: i.id,
      name: i.name,
      priceText: i.price.toFixed(2),
    })),
  );
  const [index, setIndex] = useState(0);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});

  const total = drafts.length;
  const current = drafts[index];
  const selected = current ? (assignments[current.id] ?? []) : [];
  const isLast = index === total - 1;

  useLayoutEffect(() => {
    navigation.setOptions({ title: `Item ${Math.min(index + 1, total)} of ${total}` });
  }, [navigation, index, total]);

  // Running per-person counts, so the chips show progress as you go.
  const countsByPerson = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ids of Object.values(assignments)) {
      for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [assignments]);

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

  const setField = (patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const togglePerson = (personId: string) => {
    setSkipped((prev) => ({ ...prev, [current.id]: false }));
    setAssignments((prev) => {
      const currentIds = prev[current.id] ?? [];
      const next = currentIds.includes(personId)
        ? currentIds.filter((id) => id !== personId)
        : [...currentIds, personId];
      return { ...prev, [current.id]: next };
    });
  };

  const everyone = () => {
    const allIds = bill.people.map((p) => p.id);
    const alreadyAll = selected.length === allIds.length;
    setSkipped((prev) => ({ ...prev, [current.id]: false }));
    setAssignments((prev) => ({ ...prev, [current.id]: alreadyAll ? [] : allIds }));
  };

  // Takes the maps explicitly: skipping the *last* item commits in the same tick
  // as the setState that records the skip, so `assignments`/`skipped` in scope
  // are still the pre-skip values.
  const commit = (
    finalAssignments: Record<string, string[]> = assignments,
    finalSkipped: Record<string, boolean> = skipped,
  ) => {
    const entries: ScannedAssignment[] = [];
    for (const draft of drafts) {
      if (finalSkipped[draft.id]) continue;
      const personIds = finalAssignments[draft.id] ?? [];
      if (personIds.length === 0) continue;
      const price = parseFloat(draft.priceText);
      if (isNaN(price) || price < 0) continue;
      entries.push({ name: draft.name.trim(), price, personIds });
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
    const nextAssignments = { ...assignments, [current.id]: [] };
    setSkipped(nextSkipped);
    setAssignments(nextAssignments);
    if (isLast) commit(nextAssignments, nextSkipped);
    else setIndex((i) => i + 1);
  };

  const priceValue = parseFloat(current.priceText);
  const priceValid = !isNaN(priceValue) && priceValue >= 0;
  const canAdvance = selected.length > 0 && current.name.trim().length > 0 && priceValid;
  const perPerson = selected.length > 1 ? priceValue / selected.length : null;

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
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Price</Text>
          <TextInput
            style={styles.priceInput}
            value={current.priceText}
            onChangeText={(priceText) => setField({ priceText })}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          {!priceValid && current.priceText.length > 0 && (
            <Text style={styles.warn}>That doesn't look like a price.</Text>
          )}
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.sectionLabel}>Who had this?</Text>
          <TouchableOpacity onPress={everyone}>
            <Text style={styles.link}>
              {selected.length === bill.people.length ? 'Clear all' : 'Everyone'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chipRow}>
          {bill.people.map((p) => {
            const isOn = selected.includes(p.id);
            const count = countsByPerson[p.id] ?? 0;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, isOn && styles.chipOn]}
                onPress={() => togglePerson(p.id)}
              >
                <Text style={[styles.chipText, isOn && styles.chipTextOn]}>{p.name}</Text>
                {count > 0 && (
                  <View style={[styles.badge, isOn && styles.badgeOn]}>
                    <Text style={[styles.badgeText, isOn && styles.badgeTextOn]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {perPerson !== null && (
          <Text style={styles.splitNote}>
            Split {selected.length} ways · ${perPerson.toFixed(2)} each
          </Text>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
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
