import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBill } from '../context/BillContext';
import { colors, fonts, text } from '../theme';

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
          <Pressable
            key={`${r.name}-${r.price}`}
            onPress={() => onPick(r.name, r.price)}
            accessibilityRole="button"
            accessibilityLabel={`Use ${r.name}, ${r.price.toFixed(2)}`}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.chipName}>{r.name}</Text>
            <Text style={styles.chipPrice}>{r.price.toFixed(2)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: text.label,
  row: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: colors.faint,
    borderStyle: 'dashed',
    backgroundColor: colors.paper,
  },
  chipName: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink, textTransform: 'uppercase' },
  chipPrice: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.ink },
});
