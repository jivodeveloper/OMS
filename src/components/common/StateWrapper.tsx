import { useState, useEffect, ReactNode } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import NetInfo from "@react-native-community/netinfo";

interface NetworkLoaderProps {
  isLoading?: boolean;
  loading?: boolean; 
  error?: string | null;
  onRetry?: () => void;
  children: ReactNode;
}

const NetworkLoader = ({ isLoading, loading, error, onRetry, children }: NetworkLoaderProps) => {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  if (!isConnected) {
    return (
      <View style={styles.center}>
        <Text style={{color: 'red'}}>check your internet connection</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {children}
      {(isLoading || loading) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#0000ff" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});

export default NetworkLoader;