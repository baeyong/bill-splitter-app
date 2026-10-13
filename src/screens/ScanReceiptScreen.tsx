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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Column, DashedRule, Leader, Paper, PaperButton, Stamp } from '../components/paper';
import { useBill } from '../context/BillContext';
import { colors, fonts, text } from '../theme';
import { PendingScan } from '../types/scan';
import { ScreenProps } from '../types/navigation';
import { ReceiptScanError, parseReceipt } from '../utils/parseReceipt';

export default function ScanReceiptScreen({ navigation }: ScreenProps<'ScanReceipt'>) {
  const { applyReceiptTax, setTipMode, setTipValue, pendingScan, setPendingScan } = useBill();
  const insets = useSafeAreaInsets();

  // Lives on BillContext, not here, so backing out to add a person keeps the
  // photo and the (paid-for) result.
  const imageUri = pendingScan?.imageUri ?? null;
  const scanning = pendingScan?.scanning ?? false;
  const result = pendingScan?.result ?? null;
  const progress = pendingScan?.progress;
  const [error, setError] = useState<string | null>(null);

  const [useTax, setUseTax] = useState(true);
  const [useTip, setUseTip] = useState(true);

  const itemsTotal = result?.items.reduce((sum, i) => sum + i.price * i.quantity, 0) ?? 0;
  const canApplyTax = result?.tax !== undefined;
  const canApplyTip = result?.tip !== undefined && result.tip > 0;

  const choosePhoto = (uri: string) => {
    setError(null);
    setPendingScan({ imageUri: uri, scanning: false, result: null });
  };

  // A new photo throws away the current result, which cost a request — confirm
  // first so a stray tap on Retake doesn't mean paying to scan again.
  const confirmReplace = (then: () => void) => {
    if (!result) {
      then();
      return;
    }
    Alert.alert('Replace this scan?', 'The items already read from this receipt will be lost.', [
      { text: 'Keep scan', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: then },
    ]);
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
    choosePhoto(shot.assets[0].uri);
  };

  const pickPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    choosePhoto(picked.assets[0].uri);
  };

  const scan = async () => {
    const uri = imageUri;
    if (!uri) return;
    // Every update checks the photo is still the one being scanned: the user
    // can leave and come back mid-request, and the result should still land —
    // but not on top of a different photo they've since picked.
    const update = (patch: Partial<PendingScan>) =>
      setPendingScan((prev) => (prev && prev.imageUri === uri ? { ...prev, ...patch } : prev));

    update({ scanning: true });
    setError(null);
    try {
      const scanned = await parseReceipt(uri);
      update({ scanning: false, result: scanned });
      setUseTax(true);
      setUseTip(true);
    } catch (err) {
      update({ scanning: false });
      setError(
        err instanceof ReceiptScanError
          ? err.message
          : 'Something went wrong while scanning. Try again.',
      );
    }
  };

  const startAssigning = () => {
    if (!result) return;
    if (useTax && canApplyTax && result.tax !== undefined) {
      applyReceiptTax(result.tax);
    }
    if (useTip && canApplyTip && result.tip !== undefined) {
      setTipMode('amount');
      setTipValue(result.tip);
    }
    navigation.navigate('AssignItems', { items: result.items });
  };

  const confirmStartOver = () => {
    Alert.alert('Start assigning over?', "Who-had-what picks for this receipt will be cleared.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start over',
        style: 'destructive',
        onPress: () => setPendingScan((prev) => (prev ? { ...prev, progress: undefined } : prev)),
      },
    ]);
  };

  const lineCount = result?.items.length ?? 0;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Column style={styles.stack}>
          {!imageUri && (
            <Paper style={styles.card}>
              <Text style={styles.cardTitle}>Snap the receipt</Text>
              <Text style={text.body}>
                Lay it flat and get the whole thing in frame. You'll go through the lines one at a
                time and say who had what.
              </Text>
              <DashedRule />
              <Text style={text.hint}>
                The photo is sent to Anthropic's Claude API to be read. Nothing else in the app
                leaves your phone.
              </Text>
            </Paper>
          )}

          {imageUri && (
            <View style={styles.previewWrap}>
              <Image
                source={{ uri: imageUri }}
                style={styles.preview}
                resizeMode="contain"
                accessibilityLabel="Your receipt photo"
              />
            </View>
          )}

          <View style={styles.pickRow}>
            <PaperButton
              title={imageUri ? 'Retake' : 'Take photo'}
              variant="outline"
              compact
              disabled={scanning}
              onPress={() => confirmReplace(takePhoto)}
              style={styles.flex1}
            />
            <PaperButton
              title="Choose photo"
              variant="outline"
              compact
              disabled={scanning}
              onPress={() => confirmReplace(pickPhoto)}
              style={styles.flex1}
            />
          </View>

          {error && (
            <View style={styles.errorCard} accessibilityRole="alert">
              <Text style={styles.errorTitle}>Couldn't read it</Text>
              <Text style={text.body}>{error}</Text>
            </View>
          )}

          {result && (
            <Paper style={styles.card}>
              <View style={styles.resultHead}>
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>{result.restaurantName || 'Your receipt'}</Text>
                  <Text style={text.label}>
                    {lineCount} line{lineCount === 1 ? '' : 's'} found · {itemsTotal.toFixed(2)}
                  </Text>
                </View>
                <Stamp label="Read ✓" rotate={6} size={12} />
              </View>
              <DashedRule />
              <View style={styles.lines}>
                {result.items.map((item) => (
                  <Leader
                    key={item.id}
                    label={`${item.quantity} x ${item.name}`}
                    value={(item.price * item.quantity).toFixed(2)}
                    size="sm"
                  />
                ))}
              </View>

              {(canApplyTax || canApplyTip) && (
                <>
                  <DashedRule />
                  <Text style={text.hint}>
                    Tax and tip from this receipt apply to this bill only. Every new bill starts
                    again from your saved tax rate and an 18% tip.
                  </Text>
                </>
              )}

              {canApplyTax && result.tax !== undefined && (
                <View style={styles.toggleRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.toggleLabel}>Use receipt tax · {result.tax.toFixed(2)}</Text>
                    <Text style={text.hint}>Exactly as printed, split by share</Text>
                  </View>
                  <Switch
                    value={useTax}
                    onValueChange={setUseTax}
                    trackColor={{ true: colors.ink, false: colors.rule }}
                    accessibilityLabel="Use receipt tax"
                  />
                </View>
              )}

              {canApplyTip && result.tip !== undefined ? (
                <View style={styles.toggleRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.toggleLabel}>Use receipt tip · {result.tip.toFixed(2)}</Text>
                    <Text style={text.hint}>Includes any gratuity or service charge, split by share</Text>
                  </View>
                  <Switch
                    value={useTip}
                    onValueChange={setUseTip}
                    trackColor={{ true: colors.ink, false: colors.rule }}
                    accessibilityLabel="Use receipt tip"
                  />
                </View>
              ) : (
                <Text style={text.hint}>No tip on the receipt, so the tip stays at 18%.</Text>
              )}
            </Paper>
          )}
        </Column>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
        <Column style={styles.footerStack}>
          {result && progress ? (
            <>
              <PaperButton
                title={`Continue · line ${Math.min(progress.index + 1, progress.drafts.length)} of ${progress.drafts.length} ›`}
                onPress={startAssigning}
              />
              <PaperButton title="Start over" variant="outline" compact onPress={confirmStartOver} />
            </>
          ) : result ? (
            <PaperButton
              title={`Assign ${lineCount} line${lineCount === 1 ? '' : 's'} ›`}
              onPress={startAssigning}
            />
          ) : scanning ? (
            <View style={styles.scanning} accessibilityRole="progressbar" accessibilityLabel="Reading receipt">
              <ActivityIndicator color={colors.paper} />
              <Text style={styles.scanningText}>Reading receipt…</Text>
            </View>
          ) : (
            <PaperButton title="Scan receipt" disabled={!imageUri} onPress={scan} />
          )}
        </Column>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ground },
  flex1: { flex: 1 },
  scroll: { padding: 20, paddingTop: 8, paddingBottom: 24 },
  stack: { gap: 14 },
  card: { gap: 12 },
  cardTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    letterSpacing: 2,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  previewWrap: {
    height: 260,
    backgroundColor: colors.photo,
    borderWidth: 1.5,
    borderColor: colors.faint,
    borderStyle: 'dashed',
  },
  preview: { width: '100%', height: '100%' },
  pickRow: { flexDirection: 'row', gap: 10 },
  errorCard: {
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.danger,
    padding: 14,
    gap: 6,
  },
  errorTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.danger,
    textTransform: 'uppercase',
  },
  resultHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lines: { gap: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    letterSpacing: 0.5,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    backgroundColor: colors.ground,
  },
  footerStack: { gap: 10 },
  scanning: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.ink,
  },
  scanningText: {
    fontFamily: fonts.monoBold,
    fontSize: 15,
    letterSpacing: 2,
    color: colors.paper,
    textTransform: 'uppercase',
  },
});
