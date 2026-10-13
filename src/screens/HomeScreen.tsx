import { Feather } from '@expo/vector-icons';
import React, { useLayoutEffect, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Column, DashedRule, Leader, Paper, PaperButton, Stamp, TornEdge } from '../components/paper';
import { useBill } from '../context/BillContext';
import { useReceipts } from '../context/ReceiptsContext';
import { colors, fonts, text } from '../theme';
import { SavedReceipt } from '../types/bill';
import { ScreenProps } from '../types/navigation';

const userShareOf = (r: SavedReceipt): number => {
  if (!r.ownerPersonId) return 0;
  return r.breakdown.find((b) => b.personId === r.ownerPersonId)?.total ?? 0;
};

export default function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const { receipts } = useReceipts();
  const { bill, resetBill, editingReceiptId } = useBill();
  const insets = useSafeAreaInsets();

  // An unsaved bill stays in memory until it's saved or discarded, so Home
  // offers to pick it back up instead of silently reopening it as "new".
  const peopleCount = bill.people.length;
  const inProgress =
    editingReceiptId === null && (peopleCount > 0 || bill.sharedItems.length > 0);

  const startNewBill = () => {
    resetBill();
    navigation.navigate('People');
  };

  const confirmStartOver = () => {
    Alert.alert('Start a new bill?', 'The bill in progress will be discarded.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard & start new', style: 'destructive', onPress: startNewBill },
    ]);
  };

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const monthStats = useMemo(() => {
    const now = new Date();
    const ym = now.getFullYear() * 12 + now.getMonth();
    const inMonth = receipts.filter((r) => {
      const d = new Date(r.createdAt);
      return d.getFullYear() * 12 + d.getMonth() === ym;
    });
    const total = inMonth.reduce((sum, r) => sum + userShareOf(r), 0);
    const month = now.toLocaleString('en-US', { month: 'short' });
    return { count: inMonth.length, total, month };
  }, [receipts]);

  // The receipt's own date can be back-dated, so "last" means latest date.
  const last = useMemo(
    () => receipts.reduce<SavedReceipt | null>((a, r) => (!a || r.createdAt > a.createdAt ? r : a), null),
    [receipts],
  );

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
    >
      <Column>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => navigation.navigate('Setup')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.6 }]}
          >
            <Feather name="sliders" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <Paper style={styles.sheet}>
          <View style={styles.center}>
            <Text style={styles.appName}>Split It</Text>
            <Text style={[text.body, styles.tagline]}>Settle the bill, fast.</Text>
          </View>

          <DashedRule />
          {receipts.length === 0 ? (
            <Text style={[text.hint, styles.center]}>
              Your saved receipts and monthly spend will show up here.
            </Text>
          ) : (
            <View style={styles.stats}>
              <Leader
                label={`Your spend · ${monthStats.month}`}
                value={monthStats.total.toFixed(2)}
                bold
              />
              <Leader label="Receipts this month" value={String(monthStats.count)} />
              {last && (
                <Leader
                  label={`Last · ${last.restaurantName?.trim() || 'receipt'}`}
                  value={userShareOf(last).toFixed(2)}
                />
              )}
            </View>
          )}
          <DashedRule />

          {inProgress ? (
            <View style={styles.actions}>
              <PaperButton title="Continue bill" onPress={() => navigation.navigate('People')} />
              <Text style={[text.hint, styles.center]}>
                {peopleCount} {peopleCount === 1 ? 'person' : 'people'} · not saved yet
              </Text>
              <PaperButton title="Start a new bill" variant="outline" compact onPress={confirmStartOver} />
            </View>
          ) : (
            <View style={styles.actions}>
              <PaperButton title="+ New bill" onPress={startNewBill} />
            </View>
          )}
          <PaperButton
            title={receipts.length > 0 ? `View receipts (${receipts.length})` : 'View receipts'}
            variant="outline"
            onPress={() => navigation.navigate('Receipts')}
          />
          <Text style={styles.thanks} accessibilityElementsHidden>
            *** Thank you ***
          </Text>
        </Paper>
        <TornEdge />

        {!inProgress && receipts.length > 0 && (
          <Stamp label="All bills settled" rotate={-3} style={styles.stamp} />
        )}
      </Column>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  container: { paddingHorizontal: 20 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  settingsBtn: {
    width: 44,
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { marginTop: 20, paddingHorizontal: 22, paddingVertical: 28, gap: 18 },
  center: { alignItems: 'center', textAlign: 'center' },
  appName: {
    fontFamily: fonts.monoBold,
    fontSize: 28,
    letterSpacing: 3,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  tagline: { color: colors.muted, marginTop: 6 },
  stats: { gap: 10 },
  actions: { gap: 12 },
  thanks: { ...text.label, textAlign: 'center', fontSize: 11, letterSpacing: 2 },
  stamp: { alignSelf: 'center', marginTop: 32 },
});
