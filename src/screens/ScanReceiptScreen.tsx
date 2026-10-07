import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBill } from '../context/BillContext';
import { ScanResult } from '../types/scan';
import { ScreenProps } from '../types/navigation';
import { ReceiptScanError, parseReceipt } from '../utils/parseReceipt';

export default function ScanReceiptScreen({ navigation }: ScreenProps<'ScanReceipt'>) {
  const { bill, setTaxFromAmount, setTipMode, setTipValue } = useBill();
  const insets = useSafeAreaInsets();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [useTax, setUseTax] = useState(true);
  const [useTip, setUseTip] = useState(true);

  // Tax only makes sense as a rate, which needs a subtotal to divide by.
  const taxBase = result?.subtotal ?? result?.items.reduce((sum, i) => sum + i.price, 0) ?? 0;
  const canApplyTax = result?.tax !== undefined && taxBase > 0;
  const canApplyTip = result?.tip !== undefined && result.tip > 0;

  const reset = () => {
    setResult(null);
    setError(null);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Camera access needed',
        'Enable camera access for Split It in Settings to photograph a receipt.',
      );
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 1 });
    if (shot.canceled || !shot.assets[0]) return;
    reset();
    setImageUri(shot.assets[0].uri);
  };

  const pickPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    reset();
    setImageUri(picked.assets[0].uri);
  };

  const scan = async () => {
    if (!imageUri) return;
    setScanning(true);
    setError(null);
    try {
      const scanned = await parseReceipt(imageUri);
      setResult(scanned);
      setUseTax(true);
      setUseTip(true);
    } catch (err) {
      setError(
        err instanceof ReceiptScanError
          ? err.message
          : 'Something went wrong while scanning. Try again.',
      );
    } finally {
      setScanning(false);
    }
  };

  const startAssigning = () => {
    if (!result) return;
    if (useTax && canApplyTax && result.tax !== undefined) {
      setTaxFromAmount(result.tax, taxBase);
    }
    if (useTip && canApplyTip && result.tip !== undefined) {
      setTipMode('amount');
      setTipValue(result.tip);
    }
    navigation.navigate('AssignItems', { items: result.items });
  };

  const itemsTotal = result?.items.reduce((sum, i) => sum + i.price, 0) ?? 0;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!imageUri && (
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Snap the receipt</Text>
            <Text style={styles.introBody}>
              Lay it flat and get the whole thing in frame. You'll go through the items one at a
              time and say who had what.
            </Text>
            <Text style={styles.introNote}>
              The photo is sent to Google's Gemini API to be read. Nothing else in the app leaves
              your phone.
            </Text>
          </View>
        )}

        {imageUri && (
          <View style={styles.previewWrap}>
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          </View>
        )}

        <View style={styles.pickRow}>
          <TouchableOpacity style={styles.pickBtn} onPress={takePhoto} disabled={scanning}>
            <Text style={styles.pickBtnText}>{imageUri ? 'Retake' : 'Take photo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickBtn} onPress={pickPhoto} disabled={scanning}>
            <Text style={styles.pickBtnText}>Choose photo</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {result && (
          <View style={styles.resultCard}>
            {result.restaurantName && (
              <Text style={styles.resultTitle}>{result.restaurantName}</Text>
            )}
            <Text style={styles.resultCount}>
              {result.items.length} item{result.items.length === 1 ? '' : 's'} · $
              {itemsTotal.toFixed(2)}
            </Text>

            <View style={styles.itemPreviewList}>
              {result.items.map((item) => (
                <View key={item.id} style={styles.itemPreviewRow}>
                  <Text style={styles.itemPreviewName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemPreviewPrice}>${item.price.toFixed(2)}</Text>
                </View>
              ))}
            </View>

            {(canApplyTax || canApplyTip) && <View style={styles.divider} />}

            {canApplyTax && result.tax !== undefined && (
              <View style={styles.toggleRow}>
                <View style={styles.flex}>
                  <Text style={styles.toggleLabel}>
                    Use receipt tax · ${result.tax.toFixed(2)}
                  </Text>
                  <Text style={styles.toggleHint}>
                    {((result.tax / taxBase) * 100).toFixed(2)}% — replaces your saved{' '}
                    {bill.taxRatePercent}% rate
                  </Text>
                </View>
                <Switch
                  value={useTax}
                  onValueChange={setUseTax}
                  trackColor={{ true: '#3AB795', false: '#ccc' }}
                />
              </View>
            )}

            {canApplyTip && result.tip !== undefined && (
              <View style={styles.toggleRow}>
                <View style={styles.flex}>
                  <Text style={styles.toggleLabel}>
                    Use receipt tip · ${result.tip.toFixed(2)}
                  </Text>
                  <Text style={styles.toggleHint}>Split proportionally, just this bill</Text>
                </View>
                <Switch
                  value={useTip}
                  onValueChange={setUseTip}
                  trackColor={{ true: '#3AB795', false: '#ccc' }}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        {result ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={startAssigning}>
            <Text style={styles.primaryBtnText}>
              Assign {result.items.length} item{result.items.length === 1 ? '' : 's'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, (!imageUri || scanning) && styles.btnDisabled]}
            disabled={!imageUri || scanning}
            onPress={scan}
          >
            {scanning ? (
              <View style={styles.scanningRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.primaryBtnText}>Reading receipt…</Text>
              </View>
            ) : (
              <Text style={styles.primaryBtnText}>Scan receipt</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 16, paddingBottom: 24 },
  intro: { paddingVertical: 12, gap: 8 },
  introTitle: { fontSize: 20, fontWeight: '700', color: '#222' },
  introBody: { fontSize: 15, color: '#555', lineHeight: 21 },
  introNote: { fontSize: 12, color: '#999', lineHeight: 17, marginTop: 4 },
  previewWrap: {
    height: 280,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  preview: { width: '100%', height: '100%' },
  pickRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pickBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3AB795',
  },
  pickBtnText: { color: '#3AB795', fontWeight: '600' },
  errorCard: {
    marginTop: 16,
    backgroundColor: '#FDECEA',
    borderRadius: 10,
    padding: 14,
  },
  errorText: { color: '#8B2C22', fontSize: 14, lineHeight: 20 },
  resultCard: {
    marginTop: 16,
    backgroundColor: '#E8F7F1',
    borderRadius: 12,
    padding: 16,
  },
  resultTitle: { fontSize: 17, fontWeight: '700', color: '#222' },
  resultCount: { fontSize: 13, color: '#3AB795', fontWeight: '600', marginTop: 2 },
  itemPreviewList: { marginTop: 12, gap: 6 },
  itemPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemPreviewName: { flex: 1, fontSize: 14, color: '#333' },
  itemPreviewPrice: { fontSize: 14, fontWeight: '600', color: '#333' },
  divider: { height: 1, backgroundColor: '#C9E7DA', marginVertical: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#222' },
  toggleHint: { fontSize: 12, color: '#678', marginTop: 2 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  primaryBtn: {
    backgroundColor: '#3AB795',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
