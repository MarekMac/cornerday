import { createContext, useContext, useState, ReactNode } from 'react';

interface UserContextType {
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
}

const UserContext = createContext<UserContextType>({ avatarUrl: null, setAvatarUrl: () => {} });

export function UserProvider({ children }: { children: ReactNode }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  return (
    <UserContext.Provider value={{ avatarUrl, setAvatarUrl }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
