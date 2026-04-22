import React, { useState } from 'react';
import {
  Alert,
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

export default function PeopleScreen({ navigation }: ScreenProps<'People'>) {
  const { bill, setPeople } = useBill();
  const [nameInput, setNameInput] = useState('');

  const addName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    if (bill.people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate', `"${trimmed}" is already in the list.`);
      return;
    }
    setPeople([...bill.people.map((p) => p.name), trimmed]);
    setNameInput('');
  };

  const removePerson = (id: string) => {
    setPeople(bill.people.filter((p) => p.id !== id).map((p) => p.name));
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {bill.stateCode} · Tax {bill.taxRatePercent}% · Tip{' '}
          {bill.tipMode === 'percent' ? `${bill.tipValue}%` : `$${bill.tipValue.toFixed(2)}`}
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Setup')}>
          <Text style={styles.headerEdit}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={nameInput}
          onChangeText={setNameInput}
          placeholder="Add a person"
          onSubmitEditing={addName}
          returnKeyType="done"
          autoCapitalize="words"
        />
        <TouchableOpacity style={styles.addBtn} onPress={addName}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={bill.people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Add everyone who ate to start splitting.</Text>
        }
        renderItem={({ item }) => {
          const itemCount = item.items.length;
          const itemsTotal = item.items.reduce((sum, i) => sum + i.price, 0);
          return (
            <TouchableOpacity
              style={styles.personRow}
              onPress={() => navigation.navigate('PersonItems', { personId: item.id })}
            >
              <View style={styles.flex}>
                <Text style={styles.personName}>{item.name}</Text>
                <Text style={styles.personMeta}>
                  {itemCount} item{itemCount === 1 ? '' : 's'} · ${itemsTotal.toFixed(2)}
                </Text>
              </View>
              <TouchableOpacity
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() =>
                  Alert.alert('Remove person?', `Remove ${item.name} and their items?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removePerson(item.id) },
                  ])
                }
              >
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('SharedItems')}
        >
          <Text style={styles.secondaryBtnText}>
            Shared items ({bill.sharedItems.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, bill.people.length === 0 && styles.btnDisabled]}
          disabled={bill.people.length === 0}
          onPress={() => navigation.navigate('Summary')}
        >
          <Text style={styles.primaryBtnText}>View Summary</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#E8F7F1',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerText: { fontSize: 13, color: '#444' },
  headerEdit: { color: '#3AB795', fontWeight: '600', fontSize: 14 },
  addRow: { flexDirection: 'row', padding: 16, gap: 8 },
  input: {
    flex: 1,
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
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  empty: { color: '#999', textAlign: 'center', marginTop: 40 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    marginBottom: 10,
  },
  personName: { fontSize: 17, fontWeight: '600' },
  personMeta: { fontSize: 13, color: '#777', marginTop: 2 },
  removeText: { fontSize: 18, color: '#c62828', paddingHorizontal: 8 },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3AB795',
  },
  secondaryBtnText: { color: '#3AB795', fontWeight: '600' },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#3AB795',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
});
