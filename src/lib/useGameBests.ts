import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { GameKey } from './games';

export const GAME_BESTS_STORAGE_KEY = 'game_personal_bests_v2';

// Higher score = better for all games.
// memory: 150 - moves*5  |  reaction: 1000 - ms  |  rest: raw count/level
export const GAME_SCORE_FMT: Partial<Record<GameKey, (s: number) => string>> = {
  memory:        s => `${s} pts`,
  tap_dot:       s => `${s}/15`,
  reaction:      s => `${s} pts`,
  simon:         s => `rd ${s}`,
  word_scramble: s => `${s}/8`,
  stroop:        s => `${s}/10`,
  quick_math:    s => `${s}/10`,
  color_match:   s => `${s}/10`,
  number_memory: s => `lvl ${s}`,
};

export type GameBests = Partial<Record<GameKey, number>>;

export function useGameBests() {
  const [personalBests, setPersonalBests] = useState<GameBests>({});
  const [globalBests, setGlobalBests] = useState<GameBests>({});

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(GAME_BESTS_STORAGE_KEY).catch(() => null);
      if (raw) { try { setPersonalBests(JSON.parse(raw)); } catch {} }

      try {
        const { data } = await supabase
          .from('game_global_bests')
          .select('game_key, best_score');
        if (data) {
          const gb: GameBests = {};
          for (const row of data) gb[row.game_key as GameKey] = row.best_score;
          setGlobalBests(gb);
        }
      } catch {}
    })();
  }, []);

  const handleScore = async (key: GameKey, score: number) => {
    if (score <= 0) return;

    setPersonalBests(prev => {
      if (score <= (prev[key] ?? -1)) return prev;
      const next = { ...prev, [key]: score };
      AsyncStorage.setItem(GAME_BESTS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });

    setGlobalBests(prev => {
      if (score <= (prev[key] ?? -1)) return prev;
      return { ...prev, [key]: score };
    });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('game_scores').insert({ user_id: user.id, game_key: key, score });
      }
    } catch {}
  };

  return { personalBests, globalBests, handleScore };
}
