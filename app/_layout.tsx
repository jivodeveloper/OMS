import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from '@/src/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <PaperProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
        </Stack>
      </PaperProvider>
    </AuthProvider>
  );
}