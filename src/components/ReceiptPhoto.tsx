import React from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

/** The scanned photo, full screen, with pinch-to-zoom for small print. */
export default function ReceiptPhoto({
  uri,
  visible,
  onClose,
}: {
  uri: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.wrap}>
        {/* ScrollView zoom gives pinch-to-zoom on iOS without a native module. */}
        <ScrollView
          maximumZoomScale={5}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
        </ScrollView>
        <TouchableOpacity
          style={[styles.close, { top: insets.top + 8 }]}
          onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.closeText}>Done</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  close: {
    position: 'absolute',
    right: 16,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
  },
  closeText: {
    fontFamily: fonts.monoBold,
    fontSize: 14,
    letterSpacing: 1.5,
    color: colors.ink,
    textTransform: 'uppercase',
  },
});
