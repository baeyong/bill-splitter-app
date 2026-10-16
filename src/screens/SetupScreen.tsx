import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Column, DashedRule, Paper, PaperButton } from '../components/paper';
import { useBill } from '../context/BillContext';
import { colors, fonts, text } from '../theme';
import { PRIVACY_POLICY_URL, useScanConsent } from '../utils/scanConsent';
import { getStateByCode, STATE_TAX_RATES } from '../data/stateTaxRates';
import { parseAmount } from '../utils/money';
import { ScreenProps } from '../types/navigation';

export default function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  // Settings edits the saved default, not the bill on screen — which may be
  // using a one-off rate from a scanned receipt.
  const { savedTax, prefsLoaded, setStateCode, setTaxRatePercent } = useBill();
  const [taxInput, setTaxInput] = useState(String(savedTax.taxRatePercent));
  const stateInfo = getStateByCode(savedTax.stateCode);
  const isCustom = stateInfo !== undefined && savedTax.taxRatePercent !== stateInfo.rate;
  // Withdrawing consent is as easy as giving it (Apple 5.1.1(ii)).
  const [scanConsent, setScanConsent] = useScanConsent();

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
    const n = parseAmount(s);
    if (!isNaN(n)) setTaxRatePercent(n);
  };

  const commitTax = () => {
    const n = parseAmount(taxInput);
    if (isNaN(n)) setTaxInput(String(savedTax.taxRatePercent));
  };

  const done = () => {
    commitTax();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Home');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Column style={styles.stack}>
          <Paper style={styles.card}>
            <Text style={text.label}>Default tax for new bills</Text>

            <Text style={styles.fieldLabel}>State</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={savedTax.stateCode}
                onValueChange={(code) => {
                  setStateCode(code);
                  const rate = STATE_TAX_RATES.find((st) => st.code === code)?.rate ?? 0;
                  setTaxInput(String(rate));
                }}
                itemStyle={styles.pickerItem}
              >
                {STATE_TAX_RATES.map((st) => (
                  <Picker.Item key={st.code} label={`${st.name} (${st.rate}%)`} value={st.code} />
                ))}
              </Picker>
            </View>

            <Text style={styles.fieldLabel}>Tax rate (%)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={taxInput}
              onChangeText={onTaxChange}
              onBlur={commitTax}
              placeholder="7.25"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Tax rate percent"
            />
            {isCustom && stateInfo && (
              <View style={styles.customRow}>
                <Text style={[text.hint, styles.customText]}>
                  Custom rate · {stateInfo.name} is {stateInfo.rate}%
                </Text>
                <Pressable onPress={resetToStateRate} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.smallLink}>Reset</Text>
                </Pressable>
              </View>
            )}
            <Text style={text.hint}>
              Prefilled with the typical rate (state + local) for each state's main city. Change it
              if you're outside that area.
            </Text>
            <DashedRule />
            <Text style={text.hint}>
              Tip is set on each bill's Summary, since you usually pick it after the meal.
            </Text>
          </Paper>

          <Paper style={styles.card}>
            <Text style={text.label}>Receipt scanning</Text>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.fieldLabel}>Send photos to Claude</Text>
                <Text style={text.hint}>
                  Lets Tabbly read receipts for you. When off, you'll be asked again before the
                  next scan.
                </Text>
              </View>
              <Switch
                value={scanConsent === true}
                onValueChange={(on) => setScanConsent(on)}
                trackColor={{ true: colors.ink, false: colors.rule }}
                accessibilityLabel="Send photos to Claude"
              />
            </View>
            <DashedRule />
            <Text style={text.hint}>
              Receipt photos go through Tabbly's server to Anthropic's Claude API to be read. The
              server doesn't keep them. Nothing else leaves your phone.
            </Text>
            {PRIVACY_POLICY_URL && (
              <Pressable
                onPress={() => Linking.openURL(PRIVACY_POLICY_URL!)}
                accessibilityRole="link"
                hitSlop={8}
              >
                <Text style={styles.smallLink}>Read the privacy policy</Text>
              </Pressable>
            )}
          </Paper>

          <PaperButton title="Done" onPress={done} />
        </Column>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  container: { padding: 20, paddingTop: 8, paddingBottom: 40 },
  stack: { gap: 14 },
  card: { gap: 10 },
  fieldLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  pickerWrap: { borderWidth: 1.5, borderColor: colors.ink, overflow: 'hidden' },
  pickerItem: { fontFamily: fonts.sans, fontSize: 17, color: colors.ink },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 14,
    fontFamily: fonts.monoBold,
    fontSize: 18,
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 2 },
  customRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  customText: { color: colors.warn, flex: 1 },
  smallLink: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.ink,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
  },
});
