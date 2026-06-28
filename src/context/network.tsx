import NetInfo from '@react-native-community/netinfo';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const NetworkContext = createContext(true);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? true);
    });
    return unsubscribe;
  }, []);

  return (
    <NetworkContext.Provider value={isOnline}>
      {children}
    </NetworkContext.Provider>
  );
}

export const useIsOnline = () => useContext(NetworkContext);
