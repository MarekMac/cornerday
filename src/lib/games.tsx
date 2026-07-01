import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: W } = Dimensions.get('window');
const TILE_W = (W - 44) / 2;

export type GameKey =
  | 'memory' | 'tap_dot' | 'reaction'
  | 'simon' | 'word_scramble' | 'stroop' | 'quick_math'
  | 'bubble_pop' | 'color_match' | 'number_memory';

export const GAMES: { key: GameKey; emoji: string; title: string; desc: string }[] = [
  { key: 'memory',        emoji: '🃏', title: 'Memory Match',  desc: 'Find all the matching pairs' },
  { key: 'tap_dot',       emoji: '🎯', title: 'Tap the Dot',   desc: 'Tap 15 dots before they vanish' },
  { key: 'reaction',      emoji: '⚡', title: 'Reaction Test', desc: 'Tap when the screen turns green' },
  { key: 'simon',         emoji: '🌈', title: 'Simon Says',    desc: 'Repeat the growing sequence' },
  { key: 'word_scramble', emoji: '📝', title: 'Word Scramble', desc: 'Unscramble positive words' },
  { key: 'stroop',        emoji: '🎨', title: 'Stroop Test',   desc: 'Name the ink color not the word' },
  { key: 'quick_math',    emoji: '🔢', title: 'Quick Math',    desc: 'Solve 10 problems to win' },
  { key: 'bubble_pop',    emoji: '💭', title: 'Bubble Pop',    desc: 'Pop all the floating bubbles' },
  { key: 'color_match',   emoji: '🎭', title: 'Color Match',   desc: 'Match the swatch to its name' },
  { key: 'number_memory', emoji: '🧠', title: 'Number Memory', desc: 'Remember and repeat sequences' },
];

// ── Shared primitives ─────────────────────────────────────────────────────────
const GameWrap = ({ children }: { children: React.ReactNode }) => (
  <View style={gs.gameWrap}>{children}</View>
);

const GameTitle = ({ title, sub }: { title: string; sub: string }) => (
  <View style={{ alignItems: 'center', marginBottom: 20 }}>
    <Text style={gs.gameTitle}>{title}</Text>
    {!!sub && <Text style={gs.gameSub}>{sub}</Text>}
  </View>
);

const Btn = ({ label, color = '#0F6E6E', onPress, disabled }: {
  label: string; color?: string; onPress: () => void; disabled?: boolean;
}) => (
  <Pressable
    style={({ pressed }) => [gs.btn, { backgroundColor: disabled ? '#ccc' : color }, pressed && !disabled && { opacity: 0.85 }]}
    onPress={onPress}
    disabled={disabled}>
    <Text style={gs.btnTxt}>{label}</Text>
  </Pressable>
);

// ── 1. BREATHING BUBBLE ───────────────────────────────────────────────────────
function BreathingGame() {
  const scale = useRef(new Animated.Value(0.5)).current;
  const [phase, setPhase] = useState<'idle' | 'in' | 'hold' | 'out'>('idle');
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
    scale.stopAnimation();
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const cycle = useCallback(() => {
    if (!mounted.current) return;
    setPhase('in');
    Animated.timing(scale, { toValue: 1, duration: 4000, useNativeDriver: true }).start(({ finished }) => {
      if (!finished || !mounted.current) return;
      setPhase('hold');
      timer.current = setTimeout(() => {
        if (!mounted.current) return;
        setPhase('out');
        Animated.timing(scale, { toValue: 0.5, duration: 4000, useNativeDriver: true }).start(({ finished }) => {
          if (finished && mounted.current) cycle();
        });
      }, 4000);
    });
  }, [scale]);

  const start = () => { scale.setValue(0.5); setRunning(true); cycle(); };
  const stop  = () => {
    scale.stopAnimation(); scale.setValue(0.5);
    if (timer.current) clearTimeout(timer.current);
    setRunning(false); setPhase('idle');
  };

  const label =
    phase === 'in'   ? 'Breathe in...' :
    phase === 'hold' ? 'Hold...' :
    phase === 'out'  ? 'Breathe out...' : 'Tap to start';

  return (
    <GameWrap>
      <GameTitle title="Breathing Bubble" sub="4 seconds — in, hold, out" />
      <View style={gs.breathRing}>
        <Animated.View style={[gs.breathCircle, { transform: [{ scale }] }]} />
        <Text style={gs.breathLabel}>{label}</Text>
      </View>
      <Btn label={running ? 'Stop' : 'Start'} color={running ? '#888' : '#0F6E6E'} onPress={running ? stop : start} />
    </GameWrap>
  );
}

// ── 2. MEMORY MATCH ───────────────────────────────────────────────────────────
const MEM_EMOJIS = ['🌟', '🎯', '🎵', '🌈', '🏆', '💪', '🦋', '🌺'];
type MemCard = { id: number; emoji: string };

const makeCards = (): MemCard[] =>
  [...MEM_EMOJIS, ...MEM_EMOJIS]
    .sort(() => Math.random() - 0.5)
    .map((emoji, id) => ({ id, emoji }));

function MemoryGame({ onScore }: { onScore?: (s: number) => void }) {
  const [cards, setCards] = useState<MemCard[]>(makeCards);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves]     = useState(0);
  const checking = useRef(false);
  const won = matched.size === 16;

  const tap = (id: number) => {
    if (checking.current || matched.has(id) || flipped.includes(id) || flipped.length >= 2) return;
    const next = [...flipped, id];
    setFlipped(next);
    if (next.length === 2) {
      const newMoves = moves + 1;
      setMoves(newMoves);
      checking.current = true;
      const [a, b] = next;
      if (cards[a].emoji === cards[b].emoji) {
        const newMatched = new Set([...matched, a, b]);
        setMatched(newMatched);
        setFlipped([]);
        checking.current = false;
        if (newMatched.size === 16) onScore?.(Math.max(0, 150 - newMoves * 5));
      } else {
        setTimeout(() => { setFlipped([]); checking.current = false; }, 900);
      }
    }
  };

  const reset = () => {
    setCards(makeCards());
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    checking.current = false;
  };

  if (won) return (
    <GameWrap>
      <GameTitle title="Memory Match" sub="" />
      <Text style={gs.resultBig}>🎉</Text>
      <Text style={gs.resultText}>Done in {moves} moves!</Text>
      <Btn label="Play again" onPress={reset} />
    </GameWrap>
  );

  const cardW = (W - 48 - 8 * 3) / 4;
  return (
    <GameWrap>
      <GameTitle title="Memory Match" sub={`Moves: ${moves}`} />
      <View style={gs.memGrid}>
        {cards.map(card => {
          const vis = flipped.includes(card.id) || matched.has(card.id);
          return (
            <Pressable
              key={card.id}
              style={[gs.memCard, { width: cardW, height: cardW }, matched.has(card.id) && gs.memCardMatched]}
              onPress={() => tap(card.id)}>
              <Text style={gs.memCardTxt}>{vis ? card.emoji : '❓'}</Text>
            </Pressable>
          );
        })}
      </View>
    </GameWrap>
  );
}

// ── 3. TAP THE DOT ────────────────────────────────────────────────────────────
const AREA_W = W - 80;

function TapDotGame({ onScore }: { onScore?: (s: number) => void }) {
  const [pos, setPos]     = useState<{ x: number; y: number } | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone]   = useState(false);
  const [started, setStarted] = useState(false);
  const timer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef = useRef(0);
  const scoredRef = useRef(false);
  const TOTAL = 15;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (done && !scoredRef.current) { scoredRef.current = true; onScore?.(score); } }, [done, score]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const showDot = useCallback(() => {
    if (countRef.current >= TOTAL) { setPos(null); setDone(true); return; }
    const x = 10 + Math.random() * (AREA_W - 70);
    const y = 10 + Math.random() * 210;
    setPos({ x, y });
    timer.current = setTimeout(() => {
      setPos(null);
      countRef.current++;
      // Track this gap timer too (reusing the same ref) — otherwise it isn't
      // cleared by the unmount cleanup below and can call showDot() after the
      // component (and its state setters) are gone.
      timer.current = setTimeout(showDot, 300);
    }, 1400);
  }, []);

  const start = () => { countRef.current = 0; scoredRef.current = false; setScore(0); setDone(false); setStarted(true); showDot(); };

  const tap = () => {
    if (!pos) return;
    if (timer.current) clearTimeout(timer.current);
    setScore(s => s + 1);
    setPos(null);
    countRef.current++;
    timer.current = setTimeout(showDot, 300);
  };

  if (!started || done) return (
    <GameWrap>
      <GameTitle title="Tap the Dot" sub={done ? `You got ${score} / ${TOTAL}` : 'Tap 15 dots before they vanish'} />
      <Text style={gs.resultBig}>🎯</Text>
      {done && <Text style={gs.resultText}>{score === TOTAL ? 'Perfect!' : score >= 10 ? 'Great job!' : 'Keep trying!'}</Text>}
      <Btn label={done ? 'Play again' : 'Start'} onPress={start} />
    </GameWrap>
  );

  return (
    <GameWrap>
      <GameTitle title="Tap the Dot" sub={`${score} / ${TOTAL}`} />
      <View style={gs.dotArea}>
        {pos && <Pressable style={[gs.dot, { left: pos.x, top: pos.y }]} onPress={tap} />}
      </View>
    </GameWrap>
  );
}

// ── 4. REACTION TEST ──────────────────────────────────────────────────────────
type ReactPhase = 'idle' | 'waiting' | 'ready' | 'early' | 'done';

function ReactionGame({ onScore }: { onScore?: (s: number) => void }) {
  const [phase, setPhase] = useState<ReactPhase>('idle');
  const [time, setTime]   = useState<number | null>(null);
  const startTime = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'done' && time !== null) onScore?.(Math.max(0, 1000 - time)); }, [phase]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const start = () => {
    setPhase('waiting');
    setTime(null);
    timer.current = setTimeout(() => {
      setPhase('ready');
      startTime.current = Date.now();
    }, 2000 + Math.random() * 3000);
  };

  const tap = () => {
    if (phase === 'waiting') {
      clearTimeout(timer.current);
      setPhase('early');
    } else if (phase === 'ready') {
      setTime(Date.now() - startTime.current);
      setPhase('done');
    }
  };

  const bg =
    phase === 'ready'   ? '#27ae60' :
    phase === 'waiting' ? '#e74c3c' :
    '#dde8e8';

  return (
    <GameWrap>
      <GameTitle title="Reaction Test" sub="Tap when the screen turns green" />
      <Pressable style={[gs.reactionArea, { backgroundColor: bg }]} onPress={tap}>
        <Text style={gs.reactionTxt}>
          {phase === 'idle'    ? '↓ Press Start' :
           phase === 'waiting' ? 'Wait...'        :
           phase === 'ready'   ? 'TAP!'            :
           phase === 'early'   ? '⚠️ Too early!'  :
           `${time} ms`}
        </Text>
        {phase === 'done' && time !== null && (
          <Text style={gs.reactionSub}>
            {time < 250 ? '⚡ Lightning fast!' : time < 350 ? '👏 Great reflexes!' : '🙂 Keep practising'}
          </Text>
        )}
      </Pressable>
      {phase === 'idle' && <Btn label="Start" onPress={start} />}
      {(phase === 'done' || phase === 'early') && <Btn label="Try again" onPress={start} />}
    </GameWrap>
  );
}

// ── 5. SIMON SAYS ─────────────────────────────────────────────────────────────
const SIMON_COLORS = ['#e74c3c', '#3498db', '#27ae60', '#f39c12'] as const;
const SIMON_NAMES  = ['Red', 'Blue', 'Green', 'Yellow'];
type SimonPhase = 'idle' | 'showing' | 'input' | 'wrong';

function SimonGame({ onScore }: { onScore?: (s: number) => void }) {
  const [seq, setSeq]     = useState<number[]>([]);
  const [input, setInput] = useState<number[]>([]);
  const [phase, setPhase] = useState<SimonPhase>('idle');
  const [lit, setLit]     = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); }, []);

  const showSeq = useCallback((s: number[]) => {
    setPhase('showing');
    setInput([]);
    let i = 0;
    const flash = () => {
      if (!mounted.current) return;
      setLit(s[i]);
      timer.current = setTimeout(() => {
        setLit(null);
        timer.current = setTimeout(() => {
          i++;
          if (i >= s.length) { if (mounted.current) setPhase('input'); }
          else flash();
        }, 250);
      }, 550);
    };
    timer.current = setTimeout(flash, 400);
  }, []);

  const start = () => {
    const s = [Math.floor(Math.random() * 4)];
    setSeq(s);
    showSeq(s);
  };

  const press = (idx: number) => {
    if (phase !== 'input') return;
    const next = [...input, idx];
    if (next[next.length - 1] !== seq[next.length - 1]) {
      setPhase('wrong');
      onScore?.(Math.max(0, seq.length - 1));
      return;
    }
    if (next.length === seq.length) {
      const newSeq = [...seq, Math.floor(Math.random() * 4)];
      setSeq(newSeq);
      setInput([]);
      setTimeout(() => showSeq(newSeq), 600);
    } else {
      setInput(next);
    }
  };

  const sub =
    phase === 'idle'    ? 'Watch the colors, then repeat' :
    phase === 'showing' ? `Round ${seq.length} — watch...` :
    phase === 'input'   ? `Your turn! (${seq.length} colors)` :
    `Game over — you reached round ${seq.length - 1}`;

  return (
    <GameWrap>
      <GameTitle title="Simon Says" sub={sub} />
      <View style={gs.simonGrid}>
        {SIMON_COLORS.map((color, i) => (
          <Pressable
            key={i}
            style={[gs.simonBtn, { backgroundColor: color, opacity: lit === i ? 1 : 0.4 }]}
            onPress={() => press(i)}>
            <Text style={gs.simonLabel}>{SIMON_NAMES[i]}</Text>
          </Pressable>
        ))}
      </View>
      {(phase === 'idle' || phase === 'wrong') && (
        <Btn label={phase === 'idle' ? 'Start' : 'Try again'} onPress={start} />
      )}
    </GameWrap>
  );
}

// ── 6. WORD SCRAMBLE ─────────────────────────────────────────────────────────
const SCRAMBLE_WORDS = ['CALM', 'STRONG', 'HOPE', 'PEACE', 'BRAVE', 'FREE', 'TRUST', 'SAFE'];
const TOTAL_WORDS = 8;

function scramble(w: string): string {
  const a = w.split('');
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.join('') === w ? scramble(w) : a.join('');
}

interface WordState {
  wordIdx: number;
  word: string;
  scrambled: string;
  chosen: { ch: string; uid: number }[];
  avail: { ch: string; uid: number }[];
  correct: boolean;
  score: number;
  done: boolean;
}

function makeWordState(idx: number, score = 0): WordState {
  const word = SCRAMBLE_WORDS[idx % SCRAMBLE_WORDS.length];
  const s = scramble(word);
  return {
    wordIdx: idx, word, scrambled: s, chosen: [], correct: false, score, done: false,
    avail: s.split('').map((ch, i) => ({ ch, uid: Date.now() + i * 17 + idx * 1000 })),
  };
}

function WordScrambleGame({ onScore }: { onScore?: (s: number) => void }) {
  const [state, setState] = useState<WordState>(() => makeWordState(0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state.done) onScore?.(state.score); }, [state.done]);

  const pick = (item: { ch: string; uid: number }) => {
    if (state.correct) return;
    const chosen = [...state.chosen, item];
    const avail  = state.avail.filter(a => a.uid !== item.uid);
    const correct = chosen.map(n => n.ch).join('') === state.word;
    const score   = correct ? state.score + 1 : state.score;
    setState(prev => ({ ...prev, chosen, avail, correct, score }));
    if (correct) {
      const next = state.wordIdx + 1;
      if (next >= TOTAL_WORDS) {
        setTimeout(() => setState(prev => ({ ...prev, done: true })), 800);
      } else {
        setTimeout(() => setState(prev => makeWordState(next, prev.score)), 800);
      }
    }
  };

  const unpick = (uid: number) => {
    if (state.correct) return;
    const item = state.chosen.find(c => c.uid === uid);
    if (!item) return;
    setState(prev => ({
      ...prev,
      chosen: prev.chosen.filter(c => c.uid !== uid),
      avail:  [...prev.avail, item],
    }));
  };

  if (state.done) return (
    <GameWrap>
      <GameTitle title="Word Scramble" sub="" />
      <Text style={gs.resultBig}>📝</Text>
      <Text style={gs.resultText}>Solved {state.score} / {TOTAL_WORDS} words!</Text>
      <Btn label="Play again" onPress={() => setState(makeWordState(0))} />
    </GameWrap>
  );

  const blanks = state.word.length - state.chosen.length;
  return (
    <GameWrap>
      <GameTitle title="Word Scramble" sub={`${state.wordIdx + 1} / ${TOTAL_WORDS}  •  Score: ${state.score}`} />
      <Text style={gs.scrScrambled}>{state.scrambled}</Text>
      <Text style={[gs.gameSub, { marginBottom: 12 }]}>Unscramble it:</Text>
      <View style={gs.scrRow}>
        {state.chosen.map((c, i) => (
          <Pressable key={c.uid} style={gs.scrTile} onPress={() => unpick(c.uid)}>
            <Text style={gs.scrTileTxt}>{c.ch}</Text>
          </Pressable>
        ))}
        {Array.from({ length: blanks }).map((_, i) => <View key={`b${i}`} style={gs.scrBlank} />)}
      </View>
      <View style={[gs.scrRow, { marginTop: 8 }]}>
        {state.avail.map(a => (
          <Pressable key={a.uid} style={gs.scrAvail} onPress={() => pick(a)}>
            <Text style={gs.scrAvailTxt}>{a.ch}</Text>
          </Pressable>
        ))}
      </View>
      {state.correct && <Text style={[gs.gameSub, { color: '#27ae60', marginTop: 12, fontSize: 16 }]}>✓ Correct!</Text>}
    </GameWrap>
  );
}

// ── 7. STROOP TEST ────────────────────────────────────────────────────────────
const STROOP_Q = [
  { word: 'RED',    ink: '#3498db' }, { word: 'BLUE',   ink: '#e74c3c' },
  { word: 'GREEN',  ink: '#f39c12' }, { word: 'YELLOW', ink: '#27ae60' },
  { word: 'RED',    ink: '#27ae60' }, { word: 'GREEN',  ink: '#3498db' },
  { word: 'BLUE',   ink: '#f39c12' }, { word: 'YELLOW', ink: '#e74c3c' },
  { word: 'RED',    ink: '#f39c12' }, { word: 'BLUE',   ink: '#27ae60' },
];
const STROOP_OPTS = [
  { label: 'Red',    hex: '#e74c3c' },
  { label: 'Blue',   hex: '#3498db' },
  { label: 'Green',  hex: '#27ae60' },
  { label: 'Yellow', hex: '#f39c12' },
];

function StroopGame({ onScore }: { onScore?: (s: number) => void }) {
  const [idx, setIdx]     = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone]   = useState(false);
  const [started, setStarted]   = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (done) onScore?.(score); }, [done]);

  const answer = (hex: string) => {
    if (feedback !== null) return;
    const ok = hex === STROOP_Q[idx].ink;
    if (ok) setScore(s => s + 1);
    setFeedback(ok);
    setTimeout(() => {
      setFeedback(null);
      if (idx + 1 >= STROOP_Q.length) { setDone(true); return; }
      setIdx(i => i + 1);
    }, 500);
  };

  const reset = () => { setIdx(0); setScore(0); setDone(false); setFeedback(null); };

  if (!started) return (
    <GameWrap>
      <GameTitle title="Stroop Test" sub="Tap the INK color, not the word" />
      <Text style={gs.resultBig}>🎨</Text>
      <Text style={[gs.gameSub, { textAlign: 'center', lineHeight: 20, marginBottom: 12 }]}>
        The word says one color but is written in another. Choose the color of the ink.
      </Text>
      <Btn label="Start" onPress={() => setStarted(true)} />
    </GameWrap>
  );

  if (done) return (
    <GameWrap>
      <GameTitle title="Stroop Test" sub="" />
      <Text style={gs.resultBig}>🎨</Text>
      <Text style={gs.resultText}>{score} / {STROOP_Q.length} correct</Text>
      <Btn label="Play again" onPress={reset} />
    </GameWrap>
  );

  const q = STROOP_Q[idx];
  return (
    <GameWrap>
      <GameTitle title="Stroop Test" sub={`${idx + 1} / ${STROOP_Q.length}  •  Score: ${score}`} />
      <Text style={[gs.stroopWord, { color: q.ink }]}>{q.word}</Text>
      {feedback !== null && (
        <Text style={[gs.gameSub, { color: feedback ? '#27ae60' : '#e74c3c', fontSize: 26 }]}>
          {feedback ? '✓' : '✗'}
        </Text>
      )}
      <View style={gs.stroopOpts}>
        {STROOP_OPTS.map(opt => (
          <Pressable key={opt.label} style={[gs.stroopBtn, { backgroundColor: opt.hex }]} onPress={() => answer(opt.hex)}>
            <Text style={gs.stroopBtnTxt}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </GameWrap>
  );
}

// ── 8. QUICK MATH ─────────────────────────────────────────────────────────────
function makeQ() {
  const ops = ['+', '-', '×'] as const;
  const op = ops[Math.floor(Math.random() * 3)];
  let a: number, b: number, ans: number;
  if (op === '+') {
    a = Math.floor(Math.random() * 15) + 1; b = Math.floor(Math.random() * 15) + 1; ans = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 15) + 10; b = Math.floor(Math.random() * 9) + 1; ans = a - b;
  } else {
    a = Math.floor(Math.random() * 8) + 2; b = Math.floor(Math.random() * 8) + 2; ans = a * b;
  }
  const opts = new Set<number>([ans]);
  while (opts.size < 4) {
    const d = ans + Math.floor(Math.random() * 8) - 4;
    if (d > 0 && d !== ans) opts.add(d);
  }
  return { q: `${a} ${op} ${b}`, ans, opts: [...opts].sort(() => Math.random() - 0.5) };
}

function QuickMathGame({ onScore }: { onScore?: (s: number) => void }) {
  const [q, setQ]         = useState(makeQ);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [done, setDone]   = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const TOTAL = 10;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (done) onScore?.(score); }, [done]);

  const answer = (val: number) => {
    if (feedback !== null) return;
    const ok = val === q.ans;
    if (ok) setScore(s => s + 1);
    setFeedback(ok);
    setTimeout(() => {
      setFeedback(null);
      if (round >= TOTAL) { setDone(true); return; }
      setRound(r => r + 1);
      setQ(makeQ());
    }, 500);
  };

  const reset = () => { setScore(0); setRound(1); setDone(false); setFeedback(null); setQ(makeQ()); };

  if (done) return (
    <GameWrap>
      <GameTitle title="Quick Math" sub="" />
      <Text style={gs.resultBig}>🔢</Text>
      <Text style={gs.resultText}>{score} / {TOTAL} correct</Text>
      <Btn label="Play again" onPress={reset} />
    </GameWrap>
  );

  return (
    <GameWrap>
      <GameTitle title="Quick Math" sub={`${round} / ${TOTAL}  •  Score: ${score}`} />
      <Text style={gs.mathQ}>{q.q} = ?</Text>
      {feedback !== null && (
        <Text style={[gs.gameSub, { color: feedback ? '#27ae60' : '#e74c3c', fontSize: 26 }]}>
          {feedback ? '✓' : '✗'}
        </Text>
      )}
      <View style={gs.mathOpts}>
        {q.opts.map(opt => (
          <Pressable key={opt} style={gs.mathBtn} onPress={() => answer(opt)}>
            <Text style={gs.mathBtnTxt}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </GameWrap>
  );
}

// ── 9. BUBBLE POP ─────────────────────────────────────────────────────────────
const BUBBLE_COLORS = ['#0F6E6E', '#3498db', '#e74c3c', '#f39c12', '#9b59b6', '#27ae60'];

function PulsingBubble({ x, y, size, color, onPress }: {
  x: number; y: number; size: number; color: string; onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.85, duration: 700, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Pressable style={{ position: 'absolute', left: x, top: y }} onPress={onPress} hitSlop={8}>
      <Animated.View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity: 0.85,
        transform: [{ scale: pulse }],
      }} />
    </Pressable>
  );
}

const makeBubbles = () =>
  Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: 10 + Math.random() * (AREA_W - 70),
    y: 10 + Math.random() * 210,
    size: 36 + Math.random() * 28,
    color: BUBBLE_COLORS[i % BUBBLE_COLORS.length],
  }));

function BubblePopGame() {
  const [bubbles, setBubbles] = useState(makeBubbles);
  const won = bubbles.length === 0;
  const pop = (id: number) => setBubbles(prev => prev.filter(b => b.id !== id));

  if (won) return (
    <GameWrap>
      <GameTitle title="Bubble Pop" sub="" />
      <Text style={gs.resultBig}>🎉</Text>
      <Text style={gs.resultText}>All popped!</Text>
      <Btn label="Play again" onPress={() => setBubbles(makeBubbles())} />
    </GameWrap>
  );

  return (
    <GameWrap>
      <GameTitle title="Bubble Pop" sub={`${bubbles.length} left`} />
      <View style={gs.dotArea}>
        {bubbles.map(b => (
          <PulsingBubble key={b.id} x={b.x} y={b.y} size={b.size} color={b.color} onPress={() => pop(b.id)} />
        ))}
      </View>
    </GameWrap>
  );
}

// ── 10. COLOR MATCH ───────────────────────────────────────────────────────────
const COLORS = [
  { name: 'Red',    hex: '#e74c3c' }, { name: 'Blue',   hex: '#3498db' },
  { name: 'Green',  hex: '#27ae60' }, { name: 'Yellow', hex: '#f1c40f' },
  { name: 'Purple', hex: '#9b59b6' }, { name: 'Orange', hex: '#e67e22' },
  { name: 'Teal',   hex: '#1abc9c' }, { name: 'Pink',   hex: '#e91e63' },
];

function makeColorQ() {
  const shuffled = [...COLORS].sort(() => Math.random() - 0.5);
  const correct  = shuffled[0];
  const opts     = shuffled.slice(0, 4).sort(() => Math.random() - 0.5);
  return { correct, opts };
}

function ColorMatchGame({ onScore }: { onScore?: (s: number) => void }) {
  const [q, setQ]         = useState(makeColorQ);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [done, setDone]   = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const TOTAL = 10;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (done) onScore?.(score); }, [done]);

  const answer = (name: string) => {
    if (feedback !== null) return;
    const ok = name === q.correct.name;
    if (ok) setScore(s => s + 1);
    setFeedback(ok);
    setTimeout(() => {
      setFeedback(null);
      if (round >= TOTAL) { setDone(true); return; }
      setRound(r => r + 1);
      setQ(makeColorQ());
    }, 500);
  };

  const reset = () => { setScore(0); setRound(1); setDone(false); setFeedback(null); setQ(makeColorQ()); };

  if (done) return (
    <GameWrap>
      <GameTitle title="Color Match" sub="" />
      <Text style={gs.resultBig}>🎭</Text>
      <Text style={gs.resultText}>{score} / {TOTAL} correct</Text>
      <Btn label="Play again" onPress={reset} />
    </GameWrap>
  );

  return (
    <GameWrap>
      <GameTitle title="Color Match" sub={`${round} / ${TOTAL}  •  Score: ${score}`} />
      <View style={[gs.colorSwatch, { backgroundColor: q.correct.hex }]} />
      {feedback !== null && (
        <Text style={[gs.gameSub, { color: feedback ? '#27ae60' : '#e74c3c', fontSize: 26 }]}>
          {feedback ? '✓' : '✗'}
        </Text>
      )}
      <View style={gs.mathOpts}>
        {q.opts.map(opt => (
          <Pressable key={opt.name} style={gs.mathBtn} onPress={() => answer(opt.name)}>
            <Text style={gs.mathBtnTxt}>{opt.name}</Text>
          </Pressable>
        ))}
      </View>
    </GameWrap>
  );
}

// ── 11. NUMBER MEMORY ─────────────────────────────────────────────────────────
type NumPhase = 'idle' | 'showing' | 'input' | 'correct' | 'wrong';

function NumberMemoryGame({ onScore }: { onScore?: (s: number) => void }) {
  const [level, setLevel] = useState(2);
  const [seq, setSeq]     = useState('');
  const [phase, setPhase] = useState<NumPhase>('idle');
  const [input, setInput] = useState('');
  const [best, setBest]   = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const startLevel = (lv: number) => {
    const s = Array.from({ length: lv }, () => Math.floor(Math.random() * 10)).join('');
    setLevel(lv);
    setSeq(s);
    setInput('');
    setPhase('showing');
    timer.current = setTimeout(() => setPhase('input'), lv * 700 + 600);
  };

  const check = () => {
    if (input === seq) {
      setBest(b => Math.max(b, level));
      setPhase('correct');
    } else {
      if (best > 0) onScore?.(best);
      setPhase('wrong');
    }
  };

  return (
    <GameWrap>
      <GameTitle title="Number Memory" sub={`Level ${level}  •  Best: ${best} digits`} />
      {phase === 'idle' && (
        <>
          <Text style={gs.resultBig}>🧠</Text>
          <Text style={[gs.gameSub, { textAlign: 'center', lineHeight: 20, marginBottom: 16 }]}>
            A number will flash on screen. Memorise it, then type it back.
          </Text>
          <Btn label="Start" onPress={() => startLevel(2)} />
        </>
      )}
      {phase === 'showing' && (
        <Text style={gs.numDisplay}>{seq}</Text>
      )}
      {phase === 'input' && (
        <>
          <Text style={gs.numDisplay}>?</Text>
          <TextInput
            style={gs.numInput}
            value={input}
            onChangeText={setInput}
            keyboardType="number-pad"
            placeholder="Type what you saw…"
            placeholderTextColor="#aaa"
            autoFocus
            maxLength={level + 2}
          />
          <Btn label="Check" onPress={check} disabled={input.length === 0} />
        </>
      )}
      {phase === 'correct' && (
        <>
          <Text style={[gs.gameSub, { color: '#27ae60', fontSize: 20, marginBottom: 8 }]}>✓ Correct!</Text>
          <Btn label={`Next level (${level + 1} digits)`} onPress={() => startLevel(level + 1)} />
        </>
      )}
      {phase === 'wrong' && (
        <>
          <Text style={[gs.gameSub, { color: '#e74c3c', fontSize: 16, marginBottom: 4 }]}>
            The number was: {seq}
          </Text>
          <Text style={[gs.gameSub, { marginBottom: 16 }]}>You typed: {input}</Text>
          <Btn label="Try again" onPress={() => startLevel(2)} />
        </>
      )}
    </GameWrap>
  );
}

// ── 12. 5-4-3-2-1 GROUNDING ──────────────────────────────────────────────────
const GROUNDING = [
  { icon: '👀', n: 5, sense: 'see',   prompt: 'Look around you. Find 5 things you can SEE right now — notice their shape, colour, and texture.' },
  { icon: '👂', n: 4, sense: 'hear',  prompt: 'Stay still for a moment. Name 4 things you can HEAR — near or far away.' },
  { icon: '✋', n: 3, sense: 'touch', prompt: 'Notice 3 things you can TOUCH or FEEL — the floor underfoot, your clothes, the air temperature.' },
  { icon: '👃', n: 2, sense: 'smell', prompt: 'Take a slow breath. Find 2 things you can SMELL, even subtle scents.' },
  { icon: '👅', n: 1, sense: 'taste', prompt: 'Notice your mouth. Name 1 thing you can TASTE right now.' },
];

function GroundingGame() {
  const [step, setStep] = useState(-1);

  if (step === -1) return (
    <GameWrap>
      <GameTitle title="5-4-3-2-1 Grounding" sub="Reconnect with your senses" />
      <Text style={gs.resultBig}>🌿</Text>
      <Text style={[gs.gameSub, { textAlign: 'center', lineHeight: 22, marginBottom: 20 }]}>
        This exercise anchors you to the present moment by gently engaging all five senses. Take your time with each step.
      </Text>
      <Btn label="Begin" onPress={() => setStep(0)} />
    </GameWrap>
  );

  if (step >= GROUNDING.length) return (
    <GameWrap>
      <GameTitle title="5-4-3-2-1 Grounding" sub="Complete" />
      <Text style={gs.resultBig}>🌿</Text>
      <Text style={gs.resultText}>You are here. You are safe.</Text>
      <Text style={[gs.gameSub, { textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 16 }]}>
        Notice how you feel now compared to when you started.
      </Text>
      <Btn label="Do it again" onPress={() => setStep(0)} />
    </GameWrap>
  );

  const s = GROUNDING[step];
  return (
    <GameWrap>
      <GameTitle title="5-4-3-2-1 Grounding" sub={`Step ${step + 1} of ${GROUNDING.length}`} />
      <Text style={{ fontSize: 72, textAlign: 'center', marginBottom: 12 }}>{s.icon}</Text>
      <Text style={gs.groundingN}>{s.n}</Text>
      <Text style={gs.groundingPrompt}>{s.prompt}</Text>
      <Text style={[gs.gameSub, { textAlign: 'center', marginBottom: 24 }]}>Take your time. Tap when ready.</Text>
      <Btn
        label={step < GROUNDING.length - 1 ? 'Next →' : 'Finish'}
        onPress={() => setStep(prev => prev + 1)}
      />
    </GameWrap>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function renderGame(key: GameKey, onScore?: (s: number) => void) {
  switch (key) {
    case 'memory':        return <MemoryGame onScore={onScore} />;
    case 'tap_dot':       return <TapDotGame onScore={onScore} />;
    case 'reaction':      return <ReactionGame onScore={onScore} />;
    case 'simon':         return <SimonGame onScore={onScore} />;
    case 'word_scramble': return <WordScrambleGame onScore={onScore} />;
    case 'stroop':        return <StroopGame onScore={onScore} />;
    case 'quick_math':    return <QuickMathGame onScore={onScore} />;
    case 'bubble_pop':    return <BubblePopGame />;
    case 'color_match':   return <ColorMatchGame onScore={onScore} />;
    case 'number_memory': return <NumberMemoryGame onScore={onScore} />;
  }
}

export default function GamesScreen() {
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const activeGameDef = GAMES.find(g => g.key === activeGame);

  return (
    <View style={gs.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={gs.header}>
        <SafeAreaView edges={['top']}>
          <View style={gs.headerContent}>
            <Pressable style={gs.backBtn} onPress={() => router.back()}>
              <Text style={gs.backBtnTxt}>‹ Back</Text>
            </Pressable>
            <Text style={gs.headerTitle}>Focus Games</Text>
            <Text style={gs.headerSub}>Engage your mind, ease the urge</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView style={gs.body} contentContainerStyle={gs.bodyContent}>
        <View style={gs.grid}>
          {GAMES.map(game => (
            <Pressable
              key={game.key}
              style={({ pressed }) => [gs.tile, pressed && { opacity: 0.82, transform: [{ scale: 0.97 }] }]}
              onPress={() => setActiveGame(game.key)}>
              <Text style={gs.tileEmoji}>{game.emoji}</Text>
              <Text style={gs.tileTitle}>{game.title}</Text>
              <Text style={gs.tileDesc}>{game.desc}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Game modal */}
      {activeGame !== null && (
        <View style={StyleSheet.absoluteFill}>
          <SafeAreaView style={gs.gameModal} edges={['top', 'bottom']}>
            <View style={gs.gameModalHeader}>
              <View style={gs.gameModalLeft}>
                <Text style={gs.gameModalEmoji}>{activeGameDef?.emoji}</Text>
                <Text style={gs.gameModalTitle}>{activeGameDef?.title}</Text>
              </View>
              <Pressable style={gs.closeBtn} onPress={() => setActiveGame(null)}>
                <Text style={gs.closeBtnTxt}>✕</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {renderGame(activeGame)}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}
    </View>
  );
}

const gs = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },

  header: { paddingBottom: 20 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12 },
  backBtn: { marginBottom: 8 },
  backBtnTxt: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  body: { flex: 1 },
  bodyContent: { padding: 16 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: TILE_W, backgroundColor: '#fff', borderRadius: 16,
    padding: 16, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  tileEmoji: { fontSize: 32, marginBottom: 4 },
  tileTitle: { fontSize: 13, fontWeight: '700', color: '#111', textAlign: 'center' },
  tileDesc:  { fontSize: 11, color: '#888', textAlign: 'center', lineHeight: 15 },

  // Game modal
  gameModal: { flex: 1, backgroundColor: '#f5f5f5' },
  gameModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  gameModalLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gameModalEmoji: { fontSize: 22 },
  gameModalTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  closeBtnTxt: { fontSize: 16, color: '#555', fontWeight: '600' },

  // Shared game styles
  gameWrap: { flex: 1, alignItems: 'center', padding: 24, paddingTop: 28 },
  gameTitle: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center' },
  gameSub:   { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 4 },

  btn: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 24, marginTop: 20 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },

  resultBig:  { fontSize: 64, textAlign: 'center', marginVertical: 16 },
  resultText: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center' },

  // Breathing
  breathRing: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginVertical: 24 },
  breathCircle: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: '#e6f7f7', borderWidth: 3, borderColor: '#0F6E6E',
  },
  breathLabel: { fontSize: 15, fontWeight: '600', color: '#0F6E6E', textAlign: 'center' },

  // Memory
  memGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', width: W - 48 },
  memCard: {
    backgroundColor: '#e6f7f7', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#a8d8d0',
  },
  memCardMatched: { backgroundColor: '#d4edda', borderColor: '#27ae60' },
  memCardTxt: { fontSize: 20 },

  // Tap dot / Bubble area
  dotArea: {
    width: AREA_W, height: 240, backgroundColor: '#fff',
    borderRadius: 16, overflow: 'hidden', position: 'relative',
    marginVertical: 16, borderWidth: 1, borderColor: '#e0e0e0',
  },
  dot: { position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: '#0F6E6E' },

  // Reaction
  reactionArea: { width: AREA_W, height: 180, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginVertical: 16, gap: 8 },
  reactionTxt: { fontSize: 26, fontWeight: '700', color: '#fff', textAlign: 'center' },
  reactionSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },

  // Simon
  simonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, width: AREA_W, justifyContent: 'center', marginVertical: 16 },
  simonBtn: { width: (AREA_W - 14) / 2, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  simonLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Word scramble
  scrScrambled: { fontSize: 34, fontWeight: '800', color: '#aaa', letterSpacing: 10, marginBottom: 4 },
  scrRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' },
  scrTile: { width: 44, height: 44, backgroundColor: '#0F6E6E', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  scrTileTxt: { fontSize: 18, fontWeight: '700', color: '#fff' },
  scrAvail: { width: 44, height: 44, backgroundColor: '#e6f7f7', borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#a8d8d0' },
  scrAvailTxt: { fontSize: 18, fontWeight: '700', color: '#0F6E6E' },
  scrBlank: { width: 44, height: 44, backgroundColor: '#ebebeb', borderRadius: 8, borderWidth: 1.5, borderColor: '#ddd', borderStyle: 'dashed' },

  // Stroop
  stroopWord: { fontSize: 52, fontWeight: '900', marginVertical: 16 },
  stroopOpts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 8 },
  stroopBtn: { paddingVertical: 13, paddingHorizontal: 22, borderRadius: 12 },
  stroopBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Math
  mathQ: { fontSize: 34, fontWeight: '700', color: '#111', marginVertical: 14 },
  mathOpts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 8 },
  mathBtn: {
    width: (AREA_W - 12) / 2, paddingVertical: 18,
    backgroundColor: '#e6f7f7', borderRadius: 14,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#a8d8d0',
  },
  mathBtnTxt: { fontSize: 22, fontWeight: '700', color: '#0F6E6E' },

  // Color match
  colorSwatch: { width: 120, height: 80, borderRadius: 16, marginVertical: 16 },

  // Number memory
  numDisplay: { fontSize: 46, fontWeight: '700', color: '#0F6E6E', letterSpacing: 8, marginVertical: 20, textAlign: 'center' },
  numInput: {
    borderWidth: 1.5, borderColor: '#a8d8d0', borderRadius: 12,
    padding: 14, fontSize: 28, color: '#111', textAlign: 'center',
    width: AREA_W, marginBottom: 8, letterSpacing: 6,
  },

  // Grounding
  groundingN: { fontSize: 80, fontWeight: '900', color: '#0F6E6E', textAlign: 'center', lineHeight: 90 },
  groundingPrompt: { fontSize: 15, color: '#333', textAlign: 'center', lineHeight: 22, marginVertical: 16, paddingHorizontal: 8 },
});
