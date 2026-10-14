import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, text } from '../theme';
import { PRIVACY_POLICY_URL } from '../utils/scanConsent';
import { Column, DashedRule, PaperButton } from './paper';

const POINTS = [
  "To read the items, Split It sends this receipt photo to Anthropic's Claude, through Split It's own server.",
  "Split It's server doesn't keep the photo. It only counts scans per day.",
  'Everything else — names, amounts, saved receipts — stays on your phone.',
];

/**
 * Asked once, before the first photo is sent (see utils/scanConsent.ts for
 * why). "Not now" sends nothing; the user can still add items by hand.
 */
export default function ScanConsentSheet({
  visible,
  onAllow,
  onDecline,
}: {
  visible: boolean;
  onAllow: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <Column style={styles.stack}>
              <Text style={text.label}>Before your first scan</Text>
              <Text style={styles.title} accessibilityRole="header">
                Your photo goes to an AI to be read
              </Text>
              <DashedRule />
              {POINTS.map((point) => (
                <View key={point} style={styles.point}>
                  <Text style={styles.arrow} accessibilityElementsHidden>
                    →
                  </Text>
                  <Text style={[text.body, styles.flex]}>{point}</Text>
                </View>
              ))}
              {PRIVACY_POLICY_URL && (
                <Pressable
                  onPress={() => Linking.openURL(PRIVACY_POLICY_URL!)}
                  accessibilityRole="link"
                  hitSlop={8}
                  style={styles.link}
                >
                  <Text style={styles.linkText}>Read the privacy policy</Text>
                </Pressable>
              )}
              <PaperButton title="OK, scan it" onPress={onAllow} />
              <PaperButton title="Not now" variant="outline" compact onPress={onDecline} />
              <Text style={[text.hint, styles.center]}>You can turn scanning off any time in Settings.</Text>
            </Column>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.paper, maxHeight: '90%' },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  stack: { gap: 14 },
  flex: { flex: 1 },
  title: {
    fontFamily: fonts.monoBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 1,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  point: { flexDirection: 'row', gap: 10 },
  arrow: { fontFamily: fonts.monoBold, fontSize: 15, lineHeight: 21, color: colors.ink },
  link: { minHeight: 32, justifyContent: 'center' },
  linkText: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.ink,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
  },
  center: { textAlign: 'center' },
});
