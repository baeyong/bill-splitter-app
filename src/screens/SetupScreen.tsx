import { Picker } from '@react-native-picker/picker';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useBill } from '../context/BillContext';
import { STATE_TAX_RATES } from '../data/stateTaxRates';
import { ScreenProps } from '../types/navigation';

export default function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  const { bill, setStateCode, setTaxRatePercent, setTipMode, setTipValue } = useBill();
  const [taxInput, setTaxInput] = useState(String(bill.taxRatePercent));
  const [tipInput, setTipInput] = useState(String(bill.tipValue));

  const onTaxChange = (s: string) => {
    setTaxInput(s);
    const n = parseFloat(s);
    if (!isNaN(n) && n >= 0) setTaxRatePercent(n);
  };

  const onTipChange = (s: string) => {
    setTipInput(s);
    const n = parseFloat(s);
    if (!isNaN(n) && n >= 0) setTipValue(n);
  };

  const commitTax = () => {
    const n = parseFloat(taxInput);
    if (isNaN(n) || n < 0) setTaxInput(String(bill.taxRatePercent));
  };

  const commitTip = () => {
    const n = parseFloat(tipInput);
    if (isNaN(n) || n < 0) setTipInput(String(bill.tipValue));
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.sectionLabel}>State</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={bill.stateCode}
            onValueChange={(code) => {
              setStateCode(code);
              const rate = STATE_TAX_RATES.find((s) => s.code === code)?.rate ?? 0;
              setTaxInput(String(rate));
            }}
          >
            {STATE_TAX_RATES.map((s) => (
              <Picker.Item key={s.code} label={`${s.name} (${s.rate}%)`} value={s.code} />
            ))}
          </Picker>
        </View>

        <Text style={styles.sectionLabel}>Tax rate (%)</Text>
        <Text style={styles.hint}>
          Prefilled with the typical combined rate (state + local) for each state's main metro.
          Override if you're outside that area.
        </Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={taxInput}
          onChangeText={onTaxChange}
          onBlur={commitTax}
          placeholder="7.25"
        />

        <Text style={styles.sectionLabel}>Tip</Text>
        <View style={styles.tipModeRow}>
          <TouchableOpacity
            style={[styles.tipModeBtn, bill.tipMode === 'percent' && styles.tipModeBtnActive]}
            onPress={() => setTipMode('percent')}
          >
            <Text
              style={[
                styles.tipModeText,
                bill.tipMode === 'percent' && styles.tipModeTextActive,
              ]}
            >
              %
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tipModeBtn, bill.tipMode === 'amount' && styles.tipModeBtnActive]}
            onPress={() => setTipMode('amount')}
          >
            <Text
              style={[
                styles.tipModeText,
                bill.tipMode === 'amount' && styles.tipModeTextActive,
              ]}
            >
              $
            </Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={tipInput}
          onChangeText={onTipChange}
          onBlur={commitTip}
          placeholder={bill.tipMode === 'percent' ? '18' : '10.00'}
        />

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            commitTax();
            commitTip();
            navigation.navigate('People');
          }}
        >
          <Text style={styles.primaryBtnText}>Continue</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Receipts')}
        >
          <Text style={styles.secondaryBtnText}>View saved receipts</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20, paddingBottom: 40 },
  sectionLabel: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 6 },
  hint: { fontSize: 13, color: '#777', marginBottom: 8 },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  tipModeRow: { flexDirection: 'row', marginBottom: 8 },
  tipModeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  tipModeBtnActive: { backgroundColor: '#3AB795', borderColor: '#3AB795' },
  tipModeText: { fontSize: 16, color: '#333' },
  tipModeTextActive: { color: '#fff', fontWeight: '600' },
  primaryBtn: {
    marginTop: 30,
    backgroundColor: '#3AB795',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#3AB795',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#3AB795', fontSize: 15, fontWeight: '600' },
});
