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
import { useBill } from '../context/BillContext';
import { ScreenProps } from '../types/navigation';

export default function PersonItemsScreen({ navigation, route }: ScreenProps<'PersonItems'>) {
  const { personId } = route.params;
  const { bill, addItem, removeItem } = useBill();
  const person = useMemo(
    () => bill.people.find((p) => p.id === personId),
    [bill.people, personId],
  );

  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');

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
    addItem(person.id, name, price);
    setItemName('');
    setItemPrice('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.addBlock}>
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
          <TouchableOpacity style={styles.addBtn} onPress={add}>
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={person.items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
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

      <View style={styles.footer}>
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
  row: { flexDirection: 'row', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addBtn: {
    backgroundColor: '#3AB795',
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 8,
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
