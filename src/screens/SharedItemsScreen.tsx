import React, { useState } from 'react';
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
import RecentItemsRow from '../components/RecentItemsRow';
import { useBill } from '../context/BillContext';
import { ScreenProps } from '../types/navigation';

export default function SharedItemsScreen({}: ScreenProps<'SharedItems'>) {
  const { bill, addSharedItem, removeSharedItem, rememberItem } = useBill();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    bill.people.forEach((p) => {
      next[p.id] = true;
    });
    setSelected(next);
  };

  const add = () => {
    const trimmed = name.trim();
    const p = parseFloat(price);
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!trimmed || isNaN(p) || p < 0 || ids.length === 0) return;
    addSharedItem(trimmed, p, ids);
    rememberItem(trimmed, p);
    setName('');
    setPrice('');
    setSelected({});
  };

  const pickRecent = (n: string, pr: number) => {
    setName(n);
    setPrice(pr.toFixed(2));
  };

  const clear = () => {
    setName('');
    setPrice('');
    setSelected({});
  };

  const hasInput =
    name.length > 0 || price.length > 0 || Object.values(selected).some(Boolean);

  const nameToLabel = (ids: string[]) =>
    ids
      .map((id) => bill.people.find((p) => p.id === id)?.name ?? '?')
      .join(', ');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {bill.people.length === 0 ? (
        <Text style={styles.empty}>Add people first, then you can create shared items.</Text>
      ) : (
        <>
          <View style={styles.addBlock}>
            {hasInput && (
              <View style={styles.headerRow}>
                <View style={styles.flex} />
                <TouchableOpacity
                  onPress={clear}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.clearLink}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}
            <RecentItemsRow filterText={name} onPick={pickRecent} />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Dish name (e.g. Calamari)"
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="Total price"
              keyboardType="decimal-pad"
            />
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Split between</Text>
              <TouchableOpacity onPress={selectAll}>
                <Text style={styles.link}>Select all</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.chipRow}>
              {bill.people.map((p) => {
                const isOn = !!selected[p.id];
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.chip, isOn && styles.chipOn]}
                    onPress={() => toggle(p.id)}
                  >
                    <Text style={[styles.chipText, isOn && styles.chipTextOn]}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={add}>
              <Text style={styles.addBtnText}>Add shared item</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={bill.sharedItems}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              <Text style={styles.empty}>No shared items yet.</Text>
            }
            renderItem={({ item }) => {
              const perPerson = item.personIds.length
                ? item.totalPrice / item.personIds.length
                : 0;
              return (
                <View style={styles.itemRow}>
                  <View style={styles.flex}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      ${item.totalPrice.toFixed(2)} · {item.personIds.length} way
                      {item.personIds.length === 1 ? '' : 's'} · ${perPerson.toFixed(2)} each
                    </Text>
                    <Text style={styles.itemMetaLight}>{nameToLabel(item.personIds)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeSharedItem(item.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  addBlock: {
    padding: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  clearLink: { color: '#c62828', fontWeight: '600', fontSize: 14 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#444' },
  link: { color: '#3AB795', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  chipOn: { backgroundColor: '#3AB795' },
  chipText: { color: '#333', fontSize: 14 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  addBtn: {
    backgroundColor: '#3AB795',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  list: { padding: 16 },
  empty: { color: '#999', textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
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
  itemName: { fontSize: 16, fontWeight: '600' },
  itemMeta: { fontSize: 13, color: '#555', marginTop: 2 },
  itemMetaLight: { fontSize: 12, color: '#888', marginTop: 2 },
  removeText: { fontSize: 16, color: '#c62828', paddingHorizontal: 8 },
});
