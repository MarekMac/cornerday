import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

interface UserContextType {
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  initial: string;
}

const UserContext = createContext<UserContextType>({ avatarUrl: null, setAvatarUrl: () => {}, initial: '?' });

export function UserProvider({ children }: { children: ReactNode }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initial, setInitial] = useState('?');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('avatar_url, display_name').eq('id', user.id).single();
      const googleAvatar = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
      setAvatarUrl(data?.avatar_url ?? googleAvatar ?? null);
      const name = data?.display_name ?? user.email ?? '?';
      setInitial(name[0].toUpperCase());
    };
    load();
  }, []);

  return (
    <UserContext.Provider value={{ avatarUrl, setAvatarUrl, initial }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
