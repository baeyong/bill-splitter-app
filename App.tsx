import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';
import { IBMPlexMono_700Bold } from '@expo-google-fonts/ibm-plex-mono/700Bold';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans/700Bold';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BillProvider } from './src/context/BillContext';
import { ReceiptsProvider } from './src/context/ReceiptsContext';
import AllItemsScreen from './src/screens/AllItemsScreen';
import AssignItemsScreen from './src/screens/AssignItemsScreen';
import HomeScreen from './src/screens/HomeScreen';
import PeopleScreen from './src/screens/PeopleScreen';
import PersonItemsScreen from './src/screens/PersonItemsScreen';
import ReceiptDetailScreen from './src/screens/ReceiptDetailScreen';
import ReceiptsScreen from './src/screens/ReceiptsScreen';
import ScanReceiptScreen from './src/screens/ScanReceiptScreen';
import SetupScreen from './src/screens/SetupScreen';
import SharedItemsScreen from './src/screens/SharedItemsScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import { colors, fonts } from './src/theme';
import { RootStackParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Hold the splash screen until the receipt fonts are in, so no screen ever
// flashes in the system font first.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // Only the weights the theme uses — the packages' main entry would bundle all 14.
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // If a font fails to load, carry on in the system font rather than hang.
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <BillProvider>
        <ReceiptsProvider>
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName="Home"
              // The standard iOS bar, dressed as a receipt: swipe-back,
              // VoiceOver and safe areas keep working for free.
              screenOptions={{
                headerStyle: { backgroundColor: colors.ground },
                headerTintColor: colors.ink,
                headerTitleStyle: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.ink },
                headerBackTitleStyle: { fontFamily: fonts.mono, fontSize: 14 },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.ground },
              }}
            >
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Setup" component={SetupScreen} options={{ title: 'SETTINGS' }} />
              <Stack.Screen name="People" component={PeopleScreen} options={{ title: 'PEOPLE' }} />
              <Stack.Screen
                name="PersonItems"
                component={PersonItemsScreen}
                options={{ title: 'ITEMS' }}
              />
              <Stack.Screen
                name="SharedItems"
                component={SharedItemsScreen}
                options={{ title: 'SHARED ITEMS' }}
              />
              <Stack.Screen
                name="AllItems"
                component={AllItemsScreen}
                options={{ title: 'ALL ITEMS' }}
              />
              <Stack.Screen
                name="ScanReceipt"
                component={ScanReceiptScreen}
                options={{ title: 'SCAN RECEIPT' }}
              />
              <Stack.Screen name="AssignItems" component={AssignItemsScreen} />
              <Stack.Screen
                name="Summary"
                component={SummaryScreen}
                options={{ title: 'SUMMARY' }}
              />
              <Stack.Screen
                name="Receipts"
                component={ReceiptsScreen}
                options={{ title: 'RECEIPTS' }}
              />
              <Stack.Screen
                name="ReceiptDetail"
                component={ReceiptDetailScreen}
                options={{ title: 'RECEIPT' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
          <StatusBar style="dark" />
        </ReceiptsProvider>
      </BillProvider>
    </SafeAreaProvider>
  );
}
