import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Column, DashedRule, Leader, NameChip, Paper, PaperButton, Stepper } from '../components/paper';
import RecentItemsRow from '../components/RecentItemsRow';
import { useBill } from '../context/BillContext';
import { colors, fonts, text } from '../theme';
import { ScreenProps } from '../types/navigation';
import { MAX_ITEM_NAME, parsePrice, priceError } from '../utils/money';

const MAX_QTY = 20;

export default function SharedItemsScreen({}: ScreenProps<'SharedItems'>) {
  const { bill, addSharedItem, removeSharedItem } = useBill();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const allIds = bill.people.map((p) => p.id);
  const pickedCount = Object.values(selected).filter(Boolean).length;
  const everyone = () =>
    setSelected(
      pickedCount === allIds.length ? {} : Object.fromEntries(allIds.map((id) => [id, true])),
    );

  const add = () => {
    const trimmed = name.trim();
    const p = parsePrice(price);
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!trimmed || isNaN(p) || ids.length === 0) return;
    const count = Math.max(1, Math.min(MAX_QTY, qty));
    for (let i = 0; i < count; i++) addSharedItem(trimmed, p, ids);
    setName('');
    setPrice('');
    setQty(1);
    setSelected({});
  };

  const pickRecent = (n: string, pr: number) => {
    setName(n);
    setPrice(pr.toFixed(2));
  };

  const clear = () => {
    setName('');
    setPrice('');
    setQty(1);
    setSelected({});
  };

  const priceOk = !isNaN(parsePrice(price));
  const canAdd = name.trim().length > 0 && priceOk && pickedCount > 0;
  const priceWarning = priceError(price);
  // Name and price are in but nobody's picked — say why Add is greyed out.
  const needsPeople = name.trim().length > 0 && priceOk && pickedCount === 0;
  const hasInput = name.length > 0 || price.length > 0 || qty > 1 || pickedCount > 0;

  const namesOf = (ids: string[]) =>
    ids.map((id) => bill.people.find((p) => p.id === id)?.name ?? '?').join(', ');

  if (bill.people.length === 0) {
    return (
      <View style={styles.flex}>
        <Text style={[text.hint, styles.empty]}>Add people first, then you can add shared dishes.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Column style={styles.stack}>
          <Paper style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={text.label}>Add a shared dish</Text>
              {hasInput && (
                <Pressable onPress={clear} accessibilityRole="button" hitSlop={8}>
                  <Text style={[styles.smallLink, styles.danger]}>Clear</Text>
                </Pressable>
              )}
            </View>
            <RecentItemsRow filterText={name} onPick={pickRecent} />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Dish name (e.g. Calamari)"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              maxLength={MAX_ITEM_NAME}
              accessibilityLabel="Dish name"
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex1]}
                value={price}
                onChangeText={setPrice}
                placeholder="Price each"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                accessibilityLabel="Price each"
              />
              <Stepper value={qty} onChange={setQty} label="Quantity" max={MAX_QTY} />
            </View>
            {priceWarning && <Text style={[text.hint, styles.danger]}>{priceWarning}</Text>}

            <View style={styles.rowBetween}>
              <Text style={styles.fieldLabel}>Split between</Text>
              <Pressable onPress={everyone} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.smallLink}>
                  {pickedCount === allIds.length ? 'Clear all' : 'Everyone'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.chips}>
              {bill.people.map((p) => (
                <NameChip key={p.id} name={p.name} on={!!selected[p.id]} onPress={() => toggle(p.id)} />
              ))}
            </View>
            {needsPeople && <Text style={text.hint}>Pick who shared it.</Text>}
            <PaperButton title="Add shared item" compact disabled={!canAdd} onPress={add} />
          </Paper>

          <Paper style={styles.list}>
            <Text style={[text.label, styles.listHead]}>Shared so far</Text>
            <DashedRule />
            {bill.sharedItems.length === 0 ? (
              <Text style={[text.hint, styles.emptyList]}>No shared dishes yet.</Text>
            ) : (
              bill.sharedItems.map((item) => {
                const ways = item.personIds.length;
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.itemMain}>
                      <Leader label={item.name} value={item.totalPrice.toFixed(2)} bold />
                      <Text style={text.hint}>
                        {ways === bill.people.length && ways > 2 ? 'Everyone' : namesOf(item.personIds)}
                        {ways > 0 ? ` · ${(item.totalPrice / ways).toFixed(2)} each` : ''}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => removeSharedItem(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.name}`}
                      style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.5 }]}
                    >
                      <Feather name="x" size={18} color={colors.faint} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </Paper>
        </Column>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  flex1: { flex: 1 },
  scroll: { padding: 20, paddingTop: 8, paddingBottom: 40 },
  stack: { gap: 14 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
  card: { gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  smallLink: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.ink,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
  },
  danger: { color: colors.danger },
  input: {
    ...text.input,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { paddingVertical: 14, gap: 0 },
  listHead: { paddingBottom: 8 },
  emptyList: { paddingVertical: 18, textAlign: 'center' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  itemMain: { flex: 1, paddingVertical: 10, gap: 2 },
  removeBtn: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
});
