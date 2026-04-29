import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RecentItemsRow from '../components/RecentItemsRow';
import { useBill } from '../context/BillContext';
import { ScreenProps } from '../types/navigation';

const MAX_QTY = 20;

export default function PersonItemsScreen({ navigation, route }: ScreenProps<'PersonItems'>) {
  const { personId } = route.params;
  const { bill, addItem, removeItem, rememberItem } = useBill();
  const insets = useSafeAreaInsets();
  const person = useMemo(
    () => bill.people.find((p) => p.id === personId),
    [bill.people, personId],
  );

  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [qty, setQty] = useState(1);

  useLayoutEffect(() => {
    if (person) navigation.setOptions({ title: person.name });
  }, [navigation, person]);

  if (!person) {
    return (
      <View style={styles.flex}>
        <Text style={styles.empty}>Person not found.</Text>
      </View>
    );
  }

  const subtotal = person.items.reduce((sum, i) => sum + i.price, 0);

  const add = () => {
    const name = itemName.trim();
    const price = parseFloat(itemPrice);
    if (!name) return;
    if (isNaN(price) || price < 0) return;
    const count = Math.max(1, Math.min(MAX_QTY, qty));
    for (let i = 0; i < count; i++) {
      addItem(person.id, name, price);
    }
    rememberItem(name, price);
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

  const hasInput = itemName.length > 0 || itemPrice.length > 0 || qty > 1;

  const decQty = () => setQty((q) => Math.max(1, q - 1));
  const incQty = () => setQty((q) => Math.min(MAX_QTY, q + 1));

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.addBlock}>
        {hasInput && (
          <View style={styles.headerRow}>
            <View style={styles.flex} />
            <TouchableOpacity onPress={clear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearLink}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}
        <RecentItemsRow filterText={itemName} onPick={pickRecent} />
        <TextInput
          style={styles.input}
          value={itemName}
          onChangeText={setItemName}
          placeholder="Item name (e.g. Burger)"
          autoCapitalize="words"
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={itemPrice}
            onChangeText={setItemPrice}
            placeholder="Price"
            keyboardType="decimal-pad"
            onSubmitEditing={add}
          />
          <View style={styles.qtyBox}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={decQty}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{qty}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={incQty}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={add}>
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={person.items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <Text style={styles.empty}>No items yet. Add what {person.name} ate.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
            <TouchableOpacity
              onPress={() => removeItem(person.id, item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <Text style={styles.subtotalLabel}>Items subtotal</Text>
        <Text style={styles.subtotalValue}>${subtotal.toFixed(2)}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  addBlock: {
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  clearLink: { color: '#c62828', fontWeight: '600', fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  qtyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  qtyBtnText: { fontSize: 18, fontWeight: '600', color: '#3AB795' },
  qtyValue: {
    minWidth: 22,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  addBtn: {
    backgroundColor: '#3AB795',
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  list: { padding: 16 },
  empty: { color: '#999', textAlign: 'center', marginTop: 40 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  itemName: { flex: 1, fontSize: 16 },
  itemPrice: { fontSize: 16, fontWeight: '600' },
  removeText: { fontSize: 16, color: '#c62828', paddingHorizontal: 8 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#E8F7F1',
  },
  subtotalLabel: { fontSize: 15, color: '#444' },
  subtotalValue: { fontSize: 18, fontWeight: '700', color: '#3AB795' },
});
