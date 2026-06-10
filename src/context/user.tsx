import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

interface UserContextType {
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  initial: string;
  isAdmin: boolean;
}

const UserContext = createContext<UserContextType>({
  avatarUrl: null,
  setAvatarUrl: () => {},
  initial: '?',
  isAdmin: false,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initial, setInitial] = useState('?');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('avatar_url, display_name, is_admin')
        .eq('id', user.id)
        .single();
      const googleAvatar = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
      setAvatarUrl(data?.avatar_url ?? googleAvatar ?? null);
      const name = data?.display_name ?? user.email ?? '?';
      setInitial((name[0] ?? '?').toUpperCase());
      setIsAdmin(data?.is_admin ?? false);
    };

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        load();
      } else {
        setAvatarUrl(null);
        setInitial('?');
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ avatarUrl, setAvatarUrl, initial, isAdmin }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
