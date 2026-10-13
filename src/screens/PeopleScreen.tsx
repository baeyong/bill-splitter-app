import { Feather } from '@expo/vector-icons';
import React, { useLayoutEffect, useState } from 'react';
import {
  Alert,
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
import { Column, DashedRule, Leader, Paper, PaperButton } from '../components/paper';
import { useBill } from '../context/BillContext';
import { colors, fonts, text } from '../theme';
import { ScreenProps } from '../types/navigation';
import { describeTax } from '../utils/calculate';
import { MAX_PERSON_NAME } from '../utils/money';

export default function PeopleScreen({ navigation }: ScreenProps<'People'>) {
  const { bill, setPeople } = useBill();
  const insets = useSafeAreaInsets();
  const [nameInput, setNameInput] = useState('');
  const itemCount =
    bill.people.reduce((sum, p) => sum + p.items.length, 0) + bill.sharedItems.length;
  const taxLabel = `${bill.stateCode} ${describeTax(bill)}`;

  // The bill's state and tax sit in the bar's corner and open Settings.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('Setup')}
          accessibilityRole="button"
          accessibilityLabel={`Tax ${taxLabel}. Change in settings`}
          hitSlop={8}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={styles.headerLink}>{taxLabel}</Text>
        </Pressable>
      ),
    });
  }, [navigation, taxLabel]);

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

  const confirmRemove = (id: string, name: string) =>
    Alert.alert('Remove person?', `Remove ${name} and their items?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePerson(id) },
    ]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Column style={styles.stack}>
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Add a person"
              placeholderTextColor={colors.muted}
              maxLength={MAX_PERSON_NAME}
              onSubmitEditing={addName}
              returnKeyType="done"
              autoCapitalize="words"
              accessibilityLabel="Person's name"
            />
            <PaperButton title="Add" compact onPress={addName} style={styles.addBtn} />
          </View>

          {bill.people.length > 0 && (
            <Pressable
              onPress={() => navigation.navigate('ScanReceipt')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.scanCard, pressed && { opacity: 0.7 }]}
            >
              <Feather name="camera" size={22} color={colors.ink} />
              <View style={styles.flexText}>
                <Text style={styles.scanTitle}>Scan a receipt</Text>
                <Text style={text.hint}>Read the items off a photo instead of typing</Text>
              </View>
              <Text style={styles.chevron} accessibilityElementsHidden>
                ›
              </Text>
            </Pressable>
          )}

          <Paper style={styles.list}>
            <View style={styles.listHeader}>
              <Text style={text.label}>Guest</Text>
              <Text style={text.label}>Own items</Text>
            </View>
            <DashedRule />
            {bill.people.length === 0 ? (
              <Text style={[text.hint, styles.empty]}>Add everyone who ate to start splitting.</Text>
            ) : (
              bill.people.map((p) => {
                const count = p.items.length;
                const total = p.items.reduce((sum, i) => sum + i.price, 0);
                return (
                  <View key={p.id} style={styles.personRow}>
                    <Pressable
                      onPress={() => navigation.navigate('PersonItems', { personId: p.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.name}, ${count} item${count === 1 ? '' : 's'}, ${total.toFixed(2)} dollars`}
                      style={({ pressed }) => [styles.personMain, pressed && { opacity: 0.6 }]}
                    >
                      <Leader label={p.name} value={total.toFixed(2)} size="lg" bold />
                      <Text style={text.hint}>
                        {count} item{count === 1 ? '' : 's'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmRemove(p.id, p.name)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${p.name}`}
                      style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.5 }]}
                    >
                      <Feather name="x" size={18} color={colors.faint} />
                    </Pressable>
                  </View>
                );
              })
            )}
            {itemCount > 0 && (
              <Pressable
                onPress={() => navigation.navigate('AllItems')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.reviewRow, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.reviewText}>
                  Review all {itemCount} item{itemCount === 1 ? '' : 's'}
                </Text>
                <Text style={styles.reviewText} accessibilityElementsHidden>
                  ›
                </Text>
              </Pressable>
            )}
          </Paper>
        </Column>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
        <Column style={styles.footerRow}>
          <PaperButton
            title={`Shared items (${bill.sharedItems.length})`}
            variant="outline"
            onPress={() => navigation.navigate('SharedItems')}
            style={styles.flexBtn}
          />
          <PaperButton
            title="Summary ›"
            disabled={bill.people.length === 0}
            onPress={() => navigation.navigate('Summary')}
            style={styles.flexBtn}
          />
        </Column>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  flexText: { flex: 1, gap: 2 },
  scroll: { padding: 20, paddingTop: 8 },
  stack: { gap: 12 },
  headerLink: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted, letterSpacing: 0.5 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: {
    ...text.input,
    flex: 1,
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
  },
  addBtn: { height: 50 },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  scanTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 15,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  chevron: { fontFamily: fonts.mono, fontSize: 18, color: colors.ink },
  list: { paddingVertical: 14, gap: 0 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8 },
  empty: { paddingVertical: 20, textAlign: 'center' },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  personMain: { flex: 1, paddingVertical: 12, gap: 2 },
  removeBtn: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  reviewRow: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  reviewText: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    backgroundColor: colors.ground,
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  flexBtn: { flex: 1, paddingHorizontal: 8 },
});
