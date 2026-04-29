import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BillProvider } from './src/context/BillContext';
import { ReceiptsProvider } from './src/context/ReceiptsContext';
import PeopleScreen from './src/screens/PeopleScreen';
import PersonItemsScreen from './src/screens/PersonItemsScreen';
import ReceiptDetailScreen from './src/screens/ReceiptDetailScreen';
import ReceiptsScreen from './src/screens/ReceiptsScreen';
import SetupScreen from './src/screens/SetupScreen';
import SharedItemsScreen from './src/screens/SharedItemsScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import { RootStackParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <BillProvider>
        <ReceiptsProvider>
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName="Setup"
              screenOptions={{
                headerStyle: { backgroundColor: '#fff' },
                headerTintColor: '#3AB795',
                headerTitleStyle: { fontWeight: '700', color: '#222' },
                headerShadowVisible: false,
              }}
            >
              <Stack.Screen name="Setup" component={SetupScreen} options={{ title: 'Setup' }} />
              <Stack.Screen name="People" component={PeopleScreen} options={{ title: 'People' }} />
              <Stack.Screen
                name="PersonItems"
                component={PersonItemsScreen}
                options={{ title: 'Items' }}
              />
              <Stack.Screen
                name="SharedItems"
                component={SharedItemsScreen}
                options={{ title: 'Shared Items' }}
              />
              <Stack.Screen
                name="Summary"
                component={SummaryScreen}
                options={{ title: 'Summary' }}
              />
              <Stack.Screen
                name="Receipts"
                component={ReceiptsScreen}
                options={{ title: 'Receipts' }}
              />
              <Stack.Screen
                name="ReceiptDetail"
                component={ReceiptDetailScreen}
                options={{ title: 'Receipt' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
          <StatusBar style="dark" />
        </ReceiptsProvider>
      </BillProvider>
    </SafeAreaProvider>
  );
}
