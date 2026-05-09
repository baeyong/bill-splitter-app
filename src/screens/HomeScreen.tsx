import React, { useLayoutEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useReceipts } from '../context/ReceiptsContext';
import { SavedReceipt } from '../types/bill';
import { ScreenProps } from '../types/navigation';

const userShareOf = (r: SavedReceipt): number => {
  if (!r.ownerPersonId) return 0;
  return r.breakdown.find((b) => b.personId === r.ownerPersonId)?.total ?? 0;
};

export default function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const { receipts } = useReceipts();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const monthStats = useMemo(() => {
    const now = new Date();
    const ym = now.getFullYear() * 12 + now.getMonth();
    const inMonth = receipts.filter((r) => {
      const d = new Date(r.createdAt);
      return d.getFullYear() * 12 + d.getMonth() === ym;
    });
    const total = inMonth.reduce((sum, r) => sum + userShareOf(r), 0);
    return { count: inMonth.length, total };
  }, [receipts]);

  return (
    <View style={styles.flex}>
      <TouchableOpacity
        style={styles.gearBtn}
        onPress={() => navigation.navigate('Setup')}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.gearText}>⚙︎</Text>
      </TouchableOpacity>

      <View style={styles.heroBlock}>
        <Text style={styles.appName}>Split It</Text>
        <Text style={styles.tagline}>Settle the bill, fast.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('People')}
        >
          <Text style={styles.primaryBtnText}>+ New bill</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Receipts')}
        >
          <Text style={styles.secondaryBtnText}>
            View receipts
            {receipts.length > 0 ? `  ·  ${receipts.length}` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {monthStats.count > 0 && (
        <View style={styles.statsCard}>
          <Text style={styles.statsLabel}>Your spend this month</Text>
          <Text style={styles.statsValue}>${monthStats.total.toFixed(2)}</Text>
          <Text style={styles.statsSub}>
            across {monthStats.count} receipt{monthStats.count === 1 ? '' : 's'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff', padding: 24 },
  gearBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    padding: 6,
    zIndex: 1,
  },
  gearText: { fontSize: 22, color: '#888' },
  heroBlock: {
    alignItems: 'center',
    marginTop: 100,
    marginBottom: 48,
  },
  appName: { fontSize: 36, fontWeight: '800', color: '#222' },
  tagline: { fontSize: 15, color: '#777', marginTop: 6 },
  actions: { gap: 12, marginTop: 12 },
  primaryBtn: {
    backgroundColor: '#3AB795',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3AB795',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: '#F1F5F4',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#3AB795', fontSize: 16, fontWeight: '700' },
  statsCard: {
    marginTop: 32,
    backgroundColor: '#E8F7F1',
    borderRadius: 12,
    padding: 16,
  },
  statsLabel: { fontSize: 13, color: '#3AB795', fontWeight: '600' },
  statsValue: { fontSize: 28, fontWeight: '800', color: '#222', marginTop: 4 },
  statsSub: { fontSize: 12, color: '#666', marginTop: 2 },
});
