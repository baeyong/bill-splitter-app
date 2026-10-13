import { Feather } from '@expo/vector-icons';
import React, { useLayoutEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Column, DashedRule, Leader, Paper, PaperButton, Stepper } from '../components/paper';
import RecentItemsRow from '../components/RecentItemsRow';
import { useBill } from '../context/BillContext';
import { colors, fonts, text } from '../theme';
import { ScreenProps } from '../types/navigation';
import { MAX_ITEM_NAME, parsePrice, priceError } from '../utils/money';

const MAX_QTY = 20;

export default function PersonItemsScreen({ navigation, route }: ScreenProps<'PersonItems'>) {
  const { personId } = route.params;
  const { bill, addItem, removeItem } = useBill();
  const insets = useSafeAreaInsets();
  const person = useMemo(
    () => bill.people.find((p) => p.id === personId),
    [bill.people, personId],
  );

  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [qty, setQty] = useState(1);

  useLayoutEffect(() => {
    if (person) navigation.setOptions({ title: person.name.toUpperCase() });
  }, [navigation, person]);

  // Shared dishes count toward this person too; say so, so the list below
  // doesn't look short next to their Summary total.
  const sharedHere = useMemo(
    () => bill.sharedItems.filter((s) => s.personIds.includes(personId)),
    [bill.sharedItems, personId],
  );

  if (!person) {
    return (
      <View style={styles.flex}>
        <Text style={[text.hint, styles.empty]}>Person not found.</Text>
      </View>
    );
  }

  const subtotal = person.items.reduce((sum, i) => sum + i.price, 0);
  const canAdd = itemName.trim().length > 0 && !isNaN(parsePrice(itemPrice));
  const priceWarning = priceError(itemPrice);
  const hasInput = itemName.length > 0 || itemPrice.length > 0 || qty > 1;

  const add = () => {
    const name = itemName.trim();
    const price = parsePrice(itemPrice);
    if (!name || isNaN(price)) return;
    const count = Math.max(1, Math.min(MAX_QTY, qty));
    for (let i = 0; i < count; i++) addItem(person.id, name, price);
    setItemName('');
    setItemPrice('');
    setQty(1);
  };

  const pickRecent = (name: string, price: number) => {
    setItemName(name);
    setItemPrice(price.toFixed(2));
  };

  const clear = () => {
    setItemName('');
    setItemPrice('');
    setQty(1);
  };

  const sharedNote = sharedHere
    .map((s) => `1/${s.personIds.length} of ${s.name}`)
    .join(', ');

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
              <Text style={text.label}>Add an item</Text>
              {hasInput && (
                <Pressable onPress={clear} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.smallLink}>Clear</Text>
                </Pressable>
              )}
            </View>
            <RecentItemsRow filterText={itemName} onPick={pickRecent} />
            <TextInput
              style={styles.input}
              value={itemName}
              onChangeText={setItemName}
              placeholder="Item name (e.g. Burger)"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              maxLength={MAX_ITEM_NAME}
              accessibilityLabel="Item name"
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex1]}
                value={itemPrice}
                onChangeText={setItemPrice}
                placeholder="Price"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                onSubmitEditing={add}
                accessibilityLabel="Price"
              />
              <Stepper value={qty} onChange={setQty} label="Quantity" max={MAX_QTY} />
              <PaperButton title="Add" compact disabled={!canAdd} onPress={add} style={styles.addBtn} />
            </View>
            {priceWarning && <Text style={styles.warn}>{priceWarning}</Text>}
          </Paper>

          <Paper style={styles.list}>
            <Text style={[text.label, styles.listHead]}>{person.name} had</Text>
            <DashedRule />
            {person.items.length === 0 ? (
              <Text style={[text.hint, styles.emptyList]}>No items yet. Add what {person.name} ate.</Text>
            ) : (
              person.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Leader label={item.name} value={item.price.toFixed(2)} style={styles.flex1} />
                  <Pressable
                    onPress={() => removeItem(person.id, item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                    style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.5 }]}
                  >
                    <Feather name="x" size={18} color={colors.faint} />
                  </Pressable>
                </View>
              ))
            )}
            {sharedNote !== '' && (
              <Text style={[text.hint, styles.sharedNote]}>
                Plus {sharedNote} (shared) · change those in Shared items.
              </Text>
            )}
          </Paper>
        </Column>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <Column>
          <Leader label="Own items" value={subtotal.toFixed(2)} size="lg" bold />
        </Column>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  flex1: { flex: 1 },
  scroll: { padding: 20, paddingTop: 8 },
  stack: { gap: 14 },
  empty: { textAlign: 'center', marginTop: 40 },
  card: { gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallLink: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.danger,
    textDecorationLine: 'underline',
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
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: { height: 48, paddingHorizontal: 14 },
  warn: { ...text.hint, color: colors.danger },
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
  removeBtn: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  sharedNote: { paddingTop: 10 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    backgroundColor: colors.ground,
  },
});
