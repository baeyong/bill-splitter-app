import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { useReceipts } from '../context/ReceiptsContext';
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

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
      out[key] = { marked: true, dotColor: '#3AB795' };
    });
    if (selectedDay) {
      out[selectedDay] = {
        ...(out[selectedDay] ?? { marked: false, dotColor: '#3AB795' }),
        selected: true,
        selectedColor: '#3AB795',
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

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goPrevMonth} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity onPress={goNextMonth} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Your spend this month</Text>
        <Text style={styles.totalValue}>${monthlyUserTotal.toFixed(2)}</Text>
        <Text style={styles.totalSub}>
          {monthReceipts.length} receipt{monthReceipts.length === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'list' && styles.modeBtnOn]}
          onPress={() => setMode('list')}
        >
          <Text style={[styles.modeText, mode === 'list' && styles.modeTextOn]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'calendar' && styles.modeBtnOn]}
          onPress={() => setMode('calendar')}
        >
          <Text style={[styles.modeText, mode === 'calendar' && styles.modeTextOn]}>Calendar</Text>
        </TouchableOpacity>
      </View>

      {mode === 'calendar' && (
        <View style={styles.calendarWrap}>
          <Calendar
            key={calendarKey}
            current={calendarKey}
            markedDates={markedDates}
            onDayPress={onDayPress}
            onMonthChange={onCalendarMonthChange}
            theme={{
              todayTextColor: '#3AB795',
              arrowColor: '#3AB795',
              selectedDayBackgroundColor: '#3AB795',
              selectedDayTextColor: '#fff',
              dotColor: '#3AB795',
            }}
          />
          {selectedDay && (
            <Text style={styles.filterHint}>
              Showing {selectedDay} · tap day again to clear
            </Text>
          )}
        </View>
      )}

      {visibleReceipts.length === 0 ? (
        <Text style={styles.empty}>
          {receipts.length === 0
            ? 'No saved receipts yet. Save one from the Summary screen.'
            : 'No receipts for this view.'}
        </Text>
      ) : (
        visibleReceipts.map((r) => {
          const share = userShareOf(r);
          return (
            <TouchableOpacity
              key={r.id}
              style={styles.receiptCard}
              onPress={() => navigation.navigate('ReceiptDetail', { receiptId: r.id })}
            >
              <View style={styles.receiptHeader}>
                <Text style={styles.receiptTitle}>
                  {r.restaurantName?.trim() || 'Untitled receipt'}
                </Text>
                <Text style={styles.receiptTotal}>${r.grandTotal.toFixed(2)}</Text>
              </View>
              <Text style={styles.receiptMeta}>{formatTime(r.createdAt)}</Text>
              {r.ownerPersonId ? (
                <Text style={styles.receiptShare}>Your share: ${share.toFixed(2)}</Text>
              ) : (
                <Text style={styles.receiptShareDim}>You weren't tagged on this one</Text>
              )}
              {r.notes ? <Text style={styles.receiptNotes}>{r.notes}</Text> : null}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, paddingBottom: 40 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 8,
  },
  navArrow: { fontSize: 28, color: '#3AB795', paddingHorizontal: 12, fontWeight: '600' },
  monthLabel: { fontSize: 18, fontWeight: '700', color: '#222' },
  totalCard: {
    backgroundColor: '#E8F7F1',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  totalLabel: { fontSize: 13, color: '#3AB795', fontWeight: '600' },
  totalValue: { fontSize: 28, fontWeight: '800', color: '#222', marginTop: 2 },
  totalSub: { fontSize: 12, color: '#666', marginTop: 2 },
  modeRow: { flexDirection: 'row', marginBottom: 12 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  modeBtnOn: { backgroundColor: '#3AB795', borderColor: '#3AB795' },
  modeText: { fontSize: 15, color: '#333' },
  modeTextOn: { color: '#fff', fontWeight: '600' },
  calendarWrap: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  filterHint: {
    fontSize: 12,
    color: '#666',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fafafa',
  },
  empty: { color: '#999', textAlign: 'center', marginTop: 30, paddingHorizontal: 20 },
  receiptCard: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptTitle: { fontSize: 16, fontWeight: '700', flex: 1, paddingRight: 8 },
  receiptTotal: { fontSize: 16, fontWeight: '700', color: '#222' },
  receiptMeta: { fontSize: 13, color: '#777', marginTop: 2 },
  receiptShare: { fontSize: 14, color: '#3AB795', fontWeight: '600', marginTop: 6 },
  receiptShareDim: { fontSize: 13, color: '#999', marginTop: 6, fontStyle: 'italic' },
  receiptNotes: { fontSize: 13, color: '#555', marginTop: 6 },
});
