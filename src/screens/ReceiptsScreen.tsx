import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { Column, Leader, Paper } from '../components/paper';
import { useReceipts } from '../context/ReceiptsContext';
import { calendarTheme, colors, fonts, text } from '../theme';
import { SavedReceipt } from '../types/bill';
import { ScreenProps } from '../types/navigation';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const ymdFromTs = (ts: number) => ymd(new Date(ts));

const ymOfTs = (ts: number) => {
  const d = new Date(ts);
  return d.getFullYear() * 12 + d.getMonth();
};

const formatDay = (ts: number) =>
  new Date(ts)
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/,/g, '');

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const dayLabel = (ymdString: string) => {
  const [y, m, d] = ymdString.split('-').map(Number);
  return formatDay(new Date(y, m - 1, d).getTime());
};

const userShareOf = (r: SavedReceipt): number => {
  if (!r.ownerPersonId) return 0;
  const row = r.breakdown.find((b) => b.personId === r.ownerPersonId);
  return row?.total ?? 0;
};

type Mode = 'list' | 'calendar';

export default function ReceiptsScreen({ navigation }: ScreenProps<'Receipts'>) {
  const { receipts } = useReceipts();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [mode, setMode] = useState<Mode>('list');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const targetYM = year * 12 + month;

  const monthReceipts = useMemo(
    () =>
      receipts
        .filter((r) => ymOfTs(r.createdAt) === targetYM)
        .sort((a, b) => b.createdAt - a.createdAt),
    [receipts, targetYM],
  );

  const monthlyUserTotal = useMemo(
    () => monthReceipts.reduce((sum, r) => sum + userShareOf(r), 0),
    [monthReceipts],
  );

  const markedDates = useMemo(() => {
    const out: Record<string, { marked: boolean; dotColor: string; selected?: boolean; selectedColor?: string }> = {};
    monthReceipts.forEach((r) => {
      const key = ymdFromTs(r.createdAt);
      out[key] = { marked: true, dotColor: colors.stamp };
    });
    if (selectedDay) {
      out[selectedDay] = {
        ...(out[selectedDay] ?? { marked: false, dotColor: colors.stamp }),
        selected: true,
        selectedColor: colors.ink,
      };
    }
    return out;
  }, [monthReceipts, selectedDay]);

  const visibleReceipts = useMemo(() => {
    if (mode === 'calendar' && selectedDay) {
      return monthReceipts.filter((r) => ymdFromTs(r.createdAt) === selectedDay);
    }
    return monthReceipts;
  }, [mode, selectedDay, monthReceipts]);

  const goPrevMonth = () => {
    setSelectedDay(null);
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    setSelectedDay(null);
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const onDayPress = (d: DateData) => {
    setSelectedDay((prev) => (prev === d.dateString ? null : d.dateString));
  };

  const onCalendarMonthChange = (m: DateData) => {
    setSelectedDay(null);
    setYear(m.year);
    setMonth(m.month - 1);
  };

  const calendarKey = `${year}-${pad2(month + 1)}-01`;

  const monthTitle = `${MONTH_NAMES[month]} ${year}`;

  const monthNav = (
    <View style={styles.monthNav}>
      <Pressable
        onPress={goPrevMonth}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
      >
        <Feather name="chevron-left" size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.monthLabel} accessibilityRole="header">
        {monthTitle}
      </Text>
      <Pressable
        onPress={goNextMonth}
        accessibilityRole="button"
        accessibilityLabel="Next month"
        style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
      >
        <Feather name="chevron-right" size={20} color={colors.ink} />
      </Pressable>
    </View>
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Column style={styles.stack}>
        {mode === 'list' && monthNav}

        <Paper style={styles.totalCard}>
          <Leader
            label={`Your spend · ${MONTH_NAMES[month].slice(0, 3)}`}
            value={monthlyUserTotal.toFixed(2)}
            size="lg"
            bold
          />
          <Text style={text.label}>
            Across {monthReceipts.length} receipt{monthReceipts.length === 1 ? '' : 's'}
          </Text>
        </Paper>

        <View style={styles.segment}>
          {(['list', 'calendar'] as const).map((m) => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.segmentBtn, on && styles.segmentBtnOn]}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{m}</Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'calendar' && (
          <Paper style={styles.calendarCard}>
            <Calendar
              key={calendarKey}
              current={calendarKey}
              markedDates={markedDates}
              onDayPress={onDayPress}
              onMonthChange={onCalendarMonthChange}
              theme={calendarTheme}
            />
          </Paper>
        )}

        {mode === 'calendar' && selectedDay && (
          <View style={styles.dayRow}>
            <Text style={text.label}>{dayLabel(selectedDay)}</Text>
            <Pressable onPress={() => setSelectedDay(null)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.smallLink}>Show whole month</Text>
            </Pressable>
          </View>
        )}

        {visibleReceipts.length === 0 ? (
          <Text style={[text.hint, styles.empty]}>
            {mode === 'calendar' && selectedDay
              ? 'No receipts that day.'
              : `No receipts in ${monthTitle}.`}
          </Text>
        ) : (
          visibleReceipts.map((r) => {
            const share = userShareOf(r);
            return (
              <Pressable
                key={r.id}
                onPress={() => navigation.navigate('ReceiptDetail', { receiptId: r.id })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.slip, pressed && { opacity: 0.7 }]}
              >
                <Leader
                  label={r.restaurantName?.trim() || 'Untitled receipt'}
                  value={r.ownerPersonId ? share.toFixed(2) : r.grandTotal.toFixed(2)}
                  bold
                />
                <View style={styles.slipMeta}>
                  <Text style={text.label}>
                    {mode === 'calendar' && selectedDay ? formatTime(r.createdAt) : formatDay(r.createdAt)}
                  </Text>
                  <Text style={text.label}>
                    {r.ownerPersonId ? `Your share of ${r.grandTotal.toFixed(2)}` : 'Total · not tagged'}
                  </Text>
                </View>
                {r.notes ? (
                  <Text style={text.hint} numberOfLines={2}>
                    {r.notes}
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        )}
      </Column>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  container: { padding: 20, paddingTop: 8, paddingBottom: 40 },
  stack: { gap: 12 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 44,
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    letterSpacing: 2,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  totalCard: { gap: 4, paddingVertical: 16 },
  segment: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.ink },
  segmentBtn: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  segmentBtnOn: { backgroundColor: colors.ink },
  segmentText: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  segmentTextOn: { color: colors.paper },
  calendarCard: { padding: 8 },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  smallLink: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    color: colors.ink,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
  },
  empty: { textAlign: 'center', paddingVertical: 24 },
  slip: {
    backgroundColor: colors.paper,
    padding: 16,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.shadow,
  },
  slipMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
});
