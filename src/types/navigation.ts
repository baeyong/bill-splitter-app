import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Home: undefined;
  Setup: undefined;
  People: undefined;
  PersonItems: { personId: string };
  SharedItems: undefined;
  Summary: undefined;
  Receipts: undefined;
  ReceiptDetail: { receiptId: string };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
