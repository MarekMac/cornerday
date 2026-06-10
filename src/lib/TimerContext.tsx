import { createContext, useContext, useEffect, useRef, useState } from 'react';

export const TIMER_TOTAL = 20 * 60;

interface TimerContextValue {
  timerRunning: boolean;
  timerSecsLeft: number;
  timerDone: boolean;
  timerDisplay: string;
  timerPct: number;
  startTimer: () => void;
  resetTimer: () => void;
}

const TimerContext = createContext<TimerContextValue>({
  timerRunning: false,
  timerSecsLeft: TIMER_TOTAL,
  timerDone: false,
  timerDisplay: '20:00',
  timerPct: 0,
  startTimer: () => {},
  resetTimer: () => {},
});

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSecsLeft, setTimerSecsLeft] = useState(TIMER_TOTAL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!timerRunning) return;
    intervalRef.current = setInterval(() => {
      setTimerSecsLeft(prev => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerRunning]);

  const startTimer = () => { setTimerSecsLeft(TIMER_TOTAL); setTimerRunning(true); };
  const resetTimer = () => { setTimerRunning(false); setTimerSecsLeft(TIMER_TOTAL); };

  const timerDone = !timerRunning && timerSecsLeft === 0;
  const timerPct = ((TIMER_TOTAL - timerSecsLeft) / TIMER_TOTAL) * 100;
  const mins = Math.floor(timerSecsLeft / 60);
  const secs = timerSecsLeft % 60;
  const timerDisplay = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <TimerContext.Provider value={{ timerRunning, timerSecsLeft, timerDone, timerDisplay, timerPct, startTimer, resetTimer }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  return useContext(TimerContext);
}
