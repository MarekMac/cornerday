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
    const load = async (uid?: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const resolvedUser = uid ? user : user;
      if (!resolvedUser) return;
      const { data } = await supabase.from('users').select('avatar_url, display_name').eq('id', resolvedUser.id).single();
      const googleAvatar = resolvedUser.user_metadata?.avatar_url ?? resolvedUser.user_metadata?.picture ?? null;
      setAvatarUrl(data?.avatar_url ?? googleAvatar ?? null);
      const name = data?.display_name ?? resolvedUser.email ?? '?';
      setInitial((name[0] ?? '?').toUpperCase());
    };

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        load(session.user.id);
      } else {
        setAvatarUrl(null);
        setInitial('?');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ avatarUrl, setAvatarUrl, initial }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
