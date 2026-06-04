import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

interface UserContextType {
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
}

const UserContext = createContext<UserContextType>({ avatarUrl: null, setAvatarUrl: () => {} });

export function UserProvider({ children }: { children: ReactNode }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('avatar_url').eq('id', user.id).single();
      const googleAvatar = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
      setAvatarUrl(data?.avatar_url ?? googleAvatar ?? null);
    };
    load();
  }, []);

  return (
    <UserContext.Provider value={{ avatarUrl, setAvatarUrl }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
