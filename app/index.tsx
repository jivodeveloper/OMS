import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '@/src/constants/theme';

export default function Index() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (isLoggedIn) {
    return <Redirect href={'/(main)/dashboard' as Href} />;
  }

  return <Redirect href={'/(auth)/login' as Href} />;
}