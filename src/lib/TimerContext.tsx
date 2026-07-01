import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export const DEFAULT_TIMER_TOTAL = 20 * 60;

interface TimerContextValue {
  timerRunning: boolean;
  timerSecsLeft: number;
  timerTotal: number;
  timerDone: boolean;
  timerDisplay: string;
  timerPct: number;
  startTimer: (totalSecs?: number) => void;
  resetTimer: () => void;
}

const TimerContext = createContext<TimerContextValue>({
  timerRunning: false,
  timerSecsLeft: DEFAULT_TIMER_TOTAL,
  timerTotal: DEFAULT_TIMER_TOTAL,
  timerDone: false,
  timerDisplay: '20:00',
  timerPct: 0,
  startTimer: () => {},
  resetTimer: () => {},
});

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timerTotal, setTimerTotal] = useState(DEFAULT_TIMER_TOTAL);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSecsLeft, setTimerSecsLeft] = useState(DEFAULT_TIMER_TOTAL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Wall-clock end timestamp, not a countdown decremented per tick — this way the
  // displayed time stays accurate even if JS timers are throttled/paused while the
  // app is backgrounded (which happens easily mid-urge, e.g. switching apps to call
  // someone), instead of silently freezing and resuming from a stale value.
  const endAtRef = useRef<number | null>(null);

  const syncFromEndAt = () => {
    if (endAtRef.current == null) return;
    const remaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
    setTimerSecsLeft(remaining);
    if (remaining <= 0) setTimerRunning(false);
  };

  useEffect(() => {
    if (!timerRunning) return;
    intervalRef.current = setInterval(syncFromEndAt, 1000);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [timerRunning]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && timerRunning) syncFromEndAt();
    });
    return () => sub.remove();
  }, [timerRunning]);

  const startTimer = (totalSecs = DEFAULT_TIMER_TOTAL) => {
    endAtRef.current = Date.now() + totalSecs * 1000;
    setTimerTotal(totalSecs);
    setTimerSecsLeft(totalSecs);
    setTimerRunning(true);
  };
  const resetTimer = () => {
    endAtRef.current = null;
    setTimerRunning(false);
    setTimerSecsLeft(timerTotal);
  };

  const timerDone = !timerRunning && timerSecsLeft === 0;
  const timerPct = ((timerTotal - timerSecsLeft) / timerTotal) * 100;
  const mins = Math.floor(timerSecsLeft / 60);
  const secs = timerSecsLeft % 60;
  const timerDisplay = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <TimerContext.Provider value={{ timerRunning, timerSecsLeft, timerTotal, timerDone, timerDisplay, timerPct, startTimer, resetTimer }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  return useContext(TimerContext);
}
