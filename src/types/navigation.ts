import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScannedItem } from './scan';

export type RootStackParamList = {
  Home: undefined;
  Setup: undefined;
  People: undefined;
  PersonItems: { personId: string };
  SharedItems: undefined;
  ScanReceipt: undefined;
  // Plain JSON — safe to carry through navigation state.
  AssignItems: { items: ScannedItem[] };
  Summary: undefined;
  Receipts: undefined;
  ReceiptDetail: { receiptId: string };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
