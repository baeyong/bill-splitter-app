import { Feather } from '@expo/vector-icons';
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import { Column, Leader, NameChip, Paper, PaperButton, Stamp } from '../components/paper';
import ReceiptPhoto from '../components/ReceiptPhoto';
import ReceiptView from '../components/ReceiptView';
import { useBill } from '../context/BillContext';
import { colors, fonts, text } from '../theme';
import { Person } from '../types/bill';
import { AssignDraft, AssignProgress, LineMode } from '../types/scan';
import { ScreenProps } from '../types/navigation';
import {
  countsFromUnits,
  forPeople,
  modeOf,
  progressToBill,
  resizeUnits,
  unitsFromCounts,
  unitsFromShared,
  unitsOfLine,
} from '../utils/assignProgress';
import { MAX_ITEM_NAME, parsePrice, priceError } from '../utils/money';
import { rowsFromProgress } from '../utils/receiptRows';

type Draft = AssignDraft;

// Matches the quantity stepper's cap on the manual item screens.
const MAX_QTY = 20;
const TILE_COLUMNS = 4;
const TILE_GAP = 8;

const pluralBoth = (q: number) => (q === 2 ? 'both' : `all ${q}`);

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
      lineMode: {},
      assignments: {},
      unitCounts: {},
      unitPeople: {},
      skipped: {},
    };
  });
  const [drafts, setDrafts] = useState<Draft[]>(initial.drafts);
  const [index, setIndex] = useState(initial.index);
  const [lineMode, setLineMode] = useState(initial.lineMode);
  const [assignments, setAssignments] = useState(initial.assignments);
  const [unitCounts, setUnitCounts] = useState(initial.unitCounts);
  const [unitPeople, setUnitPeople] = useState(initial.unitPeople);
  const [skipped, setSkipped] = useState(initial.skipped);
  const [editing, setEditing] = useState(false);
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  const progress: AssignProgress = useMemo(
    () => ({ drafts, index, lineMode, assignments, unitCounts, unitPeople, skipped }),
    [drafts, index, lineMode, assignments, unitCounts, unitPeople, skipped],
  );

  // Mirror every change onto the pending scan. Once the scan is committed (or
  // replaced) there's nothing to mirror onto, so this becomes a no-op.
  useEffect(() => {
    setPendingScan((prev) => (prev?.result ? { ...prev, progress } : prev));
  }, [progress, setPendingScan]);

  const total = drafts.length;
  const current = drafts[index];
  const isLast = index === total - 1;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `LINE ${Math.min(index + 1, total)} OF ${total}`,
      headerRight: () => (
        <Pressable
          onPress={() => setSeeAllOpen(true)}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={styles.headerLink}>See all</Text>
        </Pressable>
      ),
    });
  }, [navigation, index, total]);

  // A new line starts out of edit mode.
  useEffect(() => setEditing(false), [index]);

  const seeAllRows = useMemo(() => rowsFromProgress(progress), [progress]);

  if (bill.people.length === 0) {
    return (
      <View style={styles.flex}>
        <Text style={[text.hint, styles.empty]}>Add people first, then scan a receipt.</Text>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.flex}>
        <Text style={[text.hint, styles.empty]}>Nothing left to assign.</Text>
      </View>
    );
  }

  const id = current.id;
  const qty = current.quantity;
  const mode = modeOf(progress, current);
  const picked = assignments[id] ?? [];
  const counts = unitCounts[id] ?? {};
  const units = unitsOfLine(progress, current);
  const unassigned = units.filter((u) => u.length === 0).length;
  const handedOut = qty - unitsFromCounts(qty, counts).filter((u) => u.length === 0).length;

  const priceValue = parsePrice(current.priceText);
  const priceValid = !isNaN(priceValue);
  const priceWarning = priceError(current.priceText);
  const lineTotal = priceValid ? priceValue * qty : 0;
  const showInputs = editing || !priceValid || current.name.trim().length === 0;

  const setField = (patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const unskip = () => setSkipped((prev) => ({ ...prev, [id]: false }));

  const setQuantity = (quantity: number) => {
    const next = Math.max(1, Math.min(MAX_QTY, quantity));
    setField({ quantity: next });
    // Fewer units than are already handed out one each: start that line's
    // counts over rather than guess whose to take back. Per-unit picks just
    // follow the new length (see resizeUnits).
    if (next < handedOut) setUnitCounts((prev) => ({ ...prev, [id]: {} }));
  };

  const togglePicked = (personId: string) => {
    unskip();
    setAssignments((prev) => {
      const ids = prev[id] ?? [];
      return {
        ...prev,
        [id]: ids.includes(personId) ? ids.filter((x) => x !== personId) : [...ids, personId],
      };
    });
  };

  const changeCount = (personId: string, delta: number) => {
    if (delta > 0 && handedOut >= qty) return;
    unskip();
    setUnitCounts((prev) => {
      const line = { ...(prev[id] ?? {}) };
      const n = Math.max(0, (line[personId] ?? 0) + delta);
      if (n === 0) delete line[personId];
      else line[personId] = n;
      return { ...prev, [id]: line };
    });
  };

  const toggleUnitPerson = (unit: number, personId: string) => {
    unskip();
    setUnitPeople((prev) => {
      const next = resizeUnits(prev[id] ?? [], qty).map((ids) => [...ids]);
      const ids = next[unit];
      next[unit] = ids.includes(personId) ? ids.filter((x) => x !== personId) : [...ids, personId];
      return { ...prev, [id]: next };
    });
  };

  // Switching keeps what's already picked: a one-each count becomes per-unit
  // picks, per-unit picks become the people sharing, and so on.
  const switchMode = (to: LineMode) => {
    if (to === mode) return;
    if (to === 'units') {
      setUnitPeople((prev) => ({
        ...prev,
        [id]: mode === 'each' ? unitsFromCounts(qty, counts) : unitsFromShared(qty, picked),
      }));
    } else if (to === 'each') {
      setUnitCounts((prev) => ({
        ...prev,
        [id]:
          mode === 'units'
            ? countsFromUnits(units)
            : picked.length === 1
              ? { [picked[0]]: qty }
              : {},
      }));
    } else {
      const everyone = new Set(units.flat());
      setAssignments((prev) => ({ ...prev, [id]: [...everyone] }));
    }
    setLineMode((prev) => ({ ...prev, [id]: to }));
  };

  const assignedEnough =
    mode === 'each' ? handedOut === qty : mode === 'all' ? picked.length > 0 : unassigned === 0;
  const canAdvance = assignedEnough && current.name.trim().length > 0 && priceValid;

  // Takes `skipped` explicitly: skipping the *last* item commits in the same
  // tick as the setState that records the skip, so `skipped` in scope is still
  // the pre-skip value.
  const commit = (finalSkipped: Record<string, boolean> = skipped) => {
    const { entries, lines } = progressToBill({ ...progress, skipped: finalSkipped });
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
    const nextSkipped = { ...skipped, [id]: true };
    setSkipped(nextSkipped);
    // Clear the line so coming back to it doesn't show stale picks that Next
    // would then silently drop.
    setAssignments((prev) => ({ ...prev, [id]: [] }));
    setUnitCounts((prev) => ({ ...prev, [id]: {} }));
    setUnitPeople((prev) => ({ ...prev, [id]: [] }));
    if (isLast) commit(nextSkipped);
    else setIndex((i) => i + 1);
  };

  const hint =
    qty === 1
      ? 'Tap who had it. Pick more than one to share it.'
      : mode === 'each'
        ? 'Tap whoever had one. Tap again for more.'
        : mode === 'all'
          ? `Tap everyone sharing ${pluralBoth(qty)}.`
          : 'Pick who had each one. One name keeps it personal, two or more share it.';

  const status = (() => {
    if (mode === 'all') {
      if (picked.length === 0) return { warn: 'Pick who had it' };
      if (picked.length === 1) return { stamp: 'Assigned ✓' };
      return { stamp: `Split ${picked.length} ways · ${(lineTotal / picked.length).toFixed(2)} each` };
    }
    const left = mode === 'each' ? qty - handedOut : unassigned;
    return left > 0 ? { warn: `${left} of ${qty} left` } : { stamp: `${qty} of ${qty} assigned` };
  })();

  const otherModes: { mode: LineMode; title: string; sub: string }[] = (
    [
      { mode: 'each', title: 'One each', sub: 'Tap a name once for each one they had' },
      {
        mode: 'all',
        title: 'All items shared',
        sub: `${qty === 2 ? 'Both' : `All ${qty}`} split between the people you pick`,
      },
      { mode: 'units', title: 'Some are shared', sub: 'Pick who had each one' },
    ] as const
  ).filter((m) => m.mode !== mode);

  const tileWidth = gridWidth > 0 ? (gridWidth - TILE_GAP * (TILE_COLUMNS - 1)) / TILE_COLUMNS : 0;
  const nextName = drafts[index + 1]?.name.trim();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Column style={styles.stack}>
          <Paper style={styles.itemCard}>
            <View style={styles.itemTop}>
              <Text style={text.label}>
                Line {index + 1} · {qty} x {priceValid ? priceValue.toFixed(2) : '?'}
              </Text>
              <Pressable
                onPress={() => setEditing((e) => !e)}
                disabled={!priceValid || current.name.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel={showInputs ? 'Done editing' : 'Edit name, price or quantity'}
                hitSlop={8}
              >
                <Text style={styles.editLink}>{showInputs ? 'Done' : 'Edit'}</Text>
              </Pressable>
            </View>
            {showInputs ? (
              <View style={styles.inputs}>
                <TextInput
                  style={styles.input}
                  value={current.name}
                  onChangeText={(name) => setField({ name })}
                  placeholder="Item name"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  maxLength={MAX_ITEM_NAME}
                  accessibilityLabel="Item name"
                />
                <View style={styles.priceRow}>
                  <TextInput
                    style={[styles.input, styles.flex1]}
                    value={current.priceText}
                    onChangeText={(priceText) => setField({ priceText })}
                    placeholder={qty > 1 ? 'Price each' : 'Price'}
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    accessibilityLabel={qty > 1 ? 'Price each' : 'Price'}
                  />
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => setQuantity(qty - 1)}
                      disabled={qty <= 1}
                      accessibilityRole="button"
                      accessibilityLabel="One fewer"
                      style={[styles.stepBtn, qty <= 1 && styles.dim]}
                    >
                      <Text style={styles.stepText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepValue} accessibilityLabel={`Quantity ${qty}`}>
                      {qty}
                    </Text>
                    <Pressable
                      onPress={() => setQuantity(qty + 1)}
                      disabled={qty >= MAX_QTY}
                      accessibilityRole="button"
                      accessibilityLabel="One more"
                      style={[styles.stepBtn, qty >= MAX_QTY && styles.dim]}
                    >
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                {priceWarning && <Text style={styles.warnText}>{priceWarning}</Text>}
              </View>
            ) : (
              <>
                {/* One size for every item: shrinking to fit made long names tiny
                    next to short ones. Long names wrap instead. */}
                <Text style={styles.itemName} numberOfLines={3}>
                  {current.name}
                </Text>
                <Leader
                  label="Line total"
                  value={`$${lineTotal.toFixed(2)}`}
                  size="lg"
                  bold
                  valueStyle={{ color: colors.stamp }}
                />
              </>
            )}
          </Paper>

          <Text style={text.body}>{hint}</Text>

          {mode === 'units' ? (
            units.map((ids, unit) => {
              const result =
                ids.length === 0
                  ? null
                  : ids.length === 1
                    ? `${bill.people.find((p) => p.id === ids[0])?.name ?? '?'} · ${priceValue.toFixed(2)}`
                    : `Shared ÷${ids.length} · ${(priceValue / ids.length).toFixed(2)} each`;
              return (
                <Paper key={unit} style={styles.unitCard}>
                  <View style={styles.unitTop}>
                    <Text style={styles.unitTitle}>
                      {current.name} {unit + 1} of {qty}
                    </Text>
                    <Text style={result ? styles.unitResult : styles.unitResultWarn}>
                      {result ?? 'Nobody yet'}
                    </Text>
                  </View>
                  <View style={styles.chips}>
                    {bill.people.map((p) => (
                      <NameChip
                        key={p.id}
                        name={p.name}
                        on={ids.includes(p.id)}
                        onPress={() => toggleUnitPerson(unit, p.id)}
                      />
                    ))}
                  </View>
                </Paper>
              );
            })
          ) : (
            <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
              {tileWidth > 0 &&
                bill.people.map((p) => (
                  <PersonTile
                    key={p.id}
                    person={p}
                    width={tileWidth}
                    mode={mode}
                    count={mode === 'each' ? counts[p.id] ?? 0 : picked.includes(p.id) ? 1 : 0}
                    onAdd={() => (mode === 'each' ? changeCount(p.id, 1) : togglePicked(p.id))}
                    onRemove={() => changeCount(p.id, -1)}
                  />
                ))}
            </View>
          )}

          <View style={styles.statusRow}>
            {'stamp' in status && status.stamp ? (
              <Stamp label={status.stamp} rotate={-3} size={12} />
            ) : (
              <Text style={styles.warnLabel}>{status.warn}</Text>
            )}
          </View>

          {qty > 1 && (
            <View style={styles.modes}>
              {otherModes.map((m, i) => (
                <Pressable
                  key={m.mode}
                  onPress={() => switchMode(m.mode)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.modeRow,
                    i > 0 && styles.modeRowBorder,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View style={styles.flex1}>
                    <Text style={styles.modeTitle}>{m.title}</Text>
                    <Text style={text.hint}>{m.sub}</Text>
                  </View>
                  <Text style={styles.chevron} accessibilityElementsHidden>
                    ›
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Column>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
        <Column style={styles.footerRow}>
          <Pressable
            onPress={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous line"
            style={({ pressed }) => [styles.prevBtn, (index === 0 || pressed) && styles.dim]}
          >
            <Feather name="chevron-left" size={22} color={colors.ink} />
          </Pressable>
          <PaperButton title="Skip" variant="outline" onPress={skip} style={styles.skipBtn} />
          <PaperButton
            title={isLast ? 'Finish ›' : `Next${nextName ? ` · ${nextName}` : ''} ›`}
            onPress={goNext}
            disabled={!canAdvance}
            style={styles.flex1}
          />
        </Column>
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
            <Pressable onPress={() => setSeeAllOpen(false)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.headerLink}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.panelScroll}>
            <Column style={styles.stack}>
              <ReceiptView
                title={pendingScan?.result?.restaurantName}
                rows={seeAllRows}
                people={bill.people}
                highlightKey={id}
                onPressRow={(row) => {
                  const i = drafts.findIndex((d) => d.id === row.key);
                  if (i >= 0) setIndex(i);
                  setSeeAllOpen(false);
                }}
                totals={[
                  {
                    label: 'Assigned so far',
                    value: seeAllRows.reduce((sum, r) => sum + r.price * (r.quantity - r.unassigned), 0),
                    bold: true,
                    printed:
                      pendingScan?.result?.subtotal !== undefined
                        ? { label: 'Receipt subtotal', value: pendingScan.result.subtotal }
                        : undefined,
                  },
                ]}
              />
              <Text style={[text.hint, styles.centerText]}>Tap a line to jump to it.</Text>
              {pendingScan?.imageUri && (
                <PaperButton
                  title="View receipt photo"
                  variant="outline"
                  compact
                  onPress={() => setPhotoOpen(true)}
                />
              )}
            </Column>
          </ScrollView>
          {pendingScan?.imageUri && (
            <ReceiptPhoto uri={pendingScan.imageUri} visible={photoOpen} onClose={() => setPhotoOpen(false)} />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/**
 * One person in the tile grid. In "one each" a tap adds a unit and the strip
 * along the bottom takes one back; otherwise a tap toggles them in or out.
 */
function PersonTile({
  person,
  width,
  mode,
  count,
  onAdd,
  onRemove,
}: {
  person: Person;
  width: number;
  mode: LineMode;
  count: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const on = count > 0;
  const perUnit = mode === 'each';
  return (
    <View style={[styles.tile, { width }, on ? styles.tileOn : styles.tileOff]}>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={
          perUnit ? `One for ${person.name}${on ? `, has ${count}` : ''}` : person.name
        }
        accessibilityState={perUnit ? undefined : { selected: on }}
        style={({ pressed }) => [styles.tileMain, pressed && { opacity: 0.6 }]}
      >
        <View style={[styles.avatar, on && styles.avatarOn]}>
          <Text style={[styles.avatarText, on && styles.avatarTextOn]}>
            {person.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.tileName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {person.name}
        </Text>
      </Pressable>
      {on && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{perUnit ? `×${count}` : '✓'}</Text>
        </View>
      )}
      {on && perUnit && (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`One fewer for ${person.name}`}
          style={({ pressed }) => [styles.minusStrip, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.minusText}>−</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  flex1: { flex: 1 },
  dim: { opacity: 0.35 },
  scroll: { padding: 20, paddingTop: 8 },
  stack: { gap: 14 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
  centerText: { textAlign: 'center' },
  headerLink: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  itemCard: { gap: 8 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editLink: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.ink,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
  },
  itemName: {
    fontFamily: fonts.monoBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  inputs: { gap: 8 },
  input: {
    ...text.input,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
  },
  priceRow: { flexDirection: 'row', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.ink },
  stepBtn: { width: 44, height: 45, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fonts.monoBold, fontSize: 20, color: colors.ink },
  stepValue: { fontFamily: fonts.monoBold, fontSize: 16, color: colors.ink, minWidth: 24, textAlign: 'center' },
  warnText: { ...text.hint, color: colors.danger },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, minHeight: 112 },
  tile: { height: 112, backgroundColor: colors.paper },
  tileOn: { borderWidth: 2, borderColor: colors.ink },
  tileOff: { borderWidth: 1.5, borderColor: colors.rule, borderStyle: 'dashed' },
  tileMain: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOn: { backgroundColor: colors.ink },
  avatarText: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.muted },
  avatarTextOn: { color: colors.paper },
  tileName: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  badge: {
    position: 'absolute',
    top: 5,
    right: 5,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 3,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.stamp,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  badgeText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.stamp },
  minusStrip: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderTopColor: colors.rule,
  },
  minusText: { fontFamily: fonts.monoBold, fontSize: 20, color: colors.ink },
  unitCard: { paddingVertical: 14, paddingHorizontal: 14, gap: 10 },
  unitTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  unitTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  unitResult: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.stamp, textTransform: 'uppercase' },
  unitResultWarn: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.warn, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusRow: { flexDirection: 'row', minHeight: 32, alignItems: 'center' },
  warnLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.warn,
    textTransform: 'uppercase',
  },
  modes: {
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderStyle: 'dashed',
  },
  modeRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 14, gap: 8 },
  modeRowBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  modeTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  chevron: { fontFamily: fonts.mono, fontSize: 18, color: colors.ink },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    backgroundColor: colors.ground,
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  prevBtn: {
    width: 56,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: { width: 96, paddingHorizontal: 8 },
  panel: { flex: 1, backgroundColor: colors.ground },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  panelTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 15,
    letterSpacing: 1.5,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  panelScroll: { padding: 16 },
});
