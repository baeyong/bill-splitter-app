import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Setup: undefined;
  People: undefined;
  PersonItems: { personId: string };
  SharedItems: undefined;
  Summary: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
