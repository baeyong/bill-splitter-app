import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useBill } from '../context/BillContext';

type Props = {
  filterText?: string;
  onPick: (name: string, price: number) => void;
  limit?: number;
};

export default function RecentItemsRow({ filterText = '', onPick, limit = 12 }: Props) {
  const { recentItems } = useBill();

  const visible = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const matches = q
      ? recentItems.filter((r) => r.name.toLowerCase().includes(q))
      : recentItems;
    return matches.slice(0, limit);
  }, [recentItems, filterText, limit]);

  if (visible.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Recent</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {visible.map((r) => (
          <TouchableOpacity
            key={`${r.name}-${r.price}`}
            style={styles.chip}
            onPress={() => onPick(r.name, r.price)}
          >
            <Text style={styles.chipName}>{r.name}</Text>
            <Text style={styles.chipPrice}>${r.price.toFixed(2)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#666' },
  row: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F1F5F4',
    borderWidth: 1,
    borderColor: '#D7E5E0',
  },
  chipName: { fontSize: 14, color: '#222' },
  chipPrice: { fontSize: 13, color: '#3AB795', fontWeight: '600' },
});
