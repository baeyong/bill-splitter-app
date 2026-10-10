import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { View } from 'react-native';
import { useBill } from '../context/BillContext';
import { getStateByCode, STATE_TAX_RATES } from '../data/stateTaxRates';
import { ScreenProps } from '../types/navigation';

export default function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  // Settings edits the saved default, not the bill on screen — which may be
  // using a one-off rate from a scanned receipt.
  const { savedTax, prefsLoaded, setStateCode, setTaxRatePercent } = useBill();
  const [taxInput, setTaxInput] = useState(String(savedTax.taxRatePercent));
  const stateInfo = getStateByCode(savedTax.stateCode);
  const isCustom = stateInfo !== undefined && savedTax.taxRatePercent !== stateInfo.rate;

  useEffect(() => {
    if (!prefsLoaded) return;
    setTaxInput(String(savedTax.taxRatePercent));
  }, [prefsLoaded]);

  const resetToStateRate = () => {
    if (!stateInfo) return;
    setStateCode(stateInfo.code);
    setTaxInput(String(stateInfo.rate));
  };

  const onTaxChange = (s: string) => {
    setTaxInput(s);
    const n = parseFloat(s);
    if (!isNaN(n) && n >= 0) setTaxRatePercent(n);
  };

  const commitTax = () => {
    const n = parseFloat(taxInput);
    if (isNaN(n) || n < 0) setTaxInput(String(savedTax.taxRatePercent));
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
            selectedValue={savedTax.stateCode}
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
        {isCustom && stateInfo && (
          <View style={styles.customRow}>
            <Text style={styles.customText}>
              Custom rate · {stateInfo.name} is {stateInfo.rate}%
            </Text>
            <TouchableOpacity
              onPress={resetToStateRate}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.resetLink}>Reset</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.hint}>
          Tip is set per-bill on the Summary screen, since you usually pick it after the meal.
        </Text>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            commitTax();
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('Home');
          }}
        >
          <Text style={styles.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20, paddingBottom: 40 },
  sectionLabel: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 6 },
  hint: { fontSize: 13, color: '#777', marginTop: 8, marginBottom: 8 },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  customRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  customText: { fontSize: 13, color: '#7A5C00' },
  resetLink: { fontSize: 14, color: '#3AB795', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryBtn: {
    marginTop: 30,
    backgroundColor: '#3AB795',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
