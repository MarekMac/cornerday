import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export type ExerciseKey =
  | 'breathing' | 'body_scan' | 'muscle_relax' | 'gratitude' | 'affirmations'
  | 'urge_surfing' | 'stop' | 'visualise' | 'worry_drop';

export const EXERCISES: { key: ExerciseKey; emoji: string; title: string; desc: string }[] = [
  { key: 'breathing',    emoji: '🌬️', title: 'Breathing',    desc: '4-4-4 calm breathing cycle' },
  { key: 'body_scan',    emoji: '🧘', title: 'Body Scan',    desc: 'Guided awareness from feet to head' },
  { key: 'muscle_relax', emoji: '💪', title: 'Muscle Relax', desc: 'Progressive tension and release' },
  { key: 'gratitude',    emoji: '🙏', title: 'Gratitude',    desc: 'Name three things you are thankful for' },
  { key: 'affirmations', emoji: '💬', title: 'Affirmations', desc: 'Positive statements to shift your mindset' },
  { key: 'urge_surfing', emoji: '🌊', title: 'Urge Surfing', desc: 'Ride the wave without acting on it' },
  { key: 'stop',         emoji: '🛑', title: 'STOP',         desc: 'Stop, Take a breath, Observe, Proceed' },
  { key: 'visualise',    emoji: '🌅', title: 'Visualise',    desc: 'Picture your life one year from now' },
  { key: 'worry_drop',   emoji: '✍️', title: 'Worry Drop',   desc: 'Write it down and let it go' },
];

// ── Shared primitives ─────────────────────────────────────────────────────────

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <View style={es.wrap}>{children}</View>
);

const Btn = ({ label, color = '#0F6E6E', onPress, disabled }: {
  label: string; color?: string; onPress: () => void; disabled?: boolean;
}) => (
  <Pressable
    style={[es.btn, { backgroundColor: disabled ? '#ccc' : color }]}
    onPress={onPress}
    disabled={disabled}>
    <Text style={es.btnTxt}>{label}</Text>
  </Pressable>
);

function ProgressBar({ total, current }: { total: number; current: number }) {
  return (
    <View style={es.progressTrack}>
      <View style={[es.progressFill, { width: `${Math.round((current / total) * 100)}%` as any }]} />
    </View>
  );
}

function Done({ message = 'Well done.' }: { message?: string }) {
  return (
    <View style={es.doneWrap}>
      <Text style={es.doneIcon}>✓</Text>
      <Text style={es.doneTxt}>{message}</Text>
    </View>
  );
}

// ── 1. Body Scan ──────────────────────────────────────────────────────────────

const BODY_STEPS = [
  { emoji: '🦶', area: 'Feet & toes',       prompt: 'Notice any tension in your feet and toes. Breathe into that area and let it soften.' },
  { emoji: '🦵', area: 'Calves & shins',    prompt: 'Move your attention to your lower legs. Feel the weight of them and let them relax.' },
  { emoji: '🦿', area: 'Thighs & knees',   prompt: 'Feel your thighs against the seat. Let all the tension melt away from your legs.' },
  { emoji: '🫁', area: 'Belly & lower back', prompt: 'Notice your belly rising and falling with each breath. Let your lower back soften.' },
  { emoji: '🫀', area: 'Chest & upper back', prompt: 'Feel your chest expand as you inhale. Let your upper back relax as you exhale.' },
  { emoji: '🤲', area: 'Hands & forearms',  prompt: 'Let your hands rest naturally. Uncurl your fingers and release any grip.' },
  { emoji: '🤷', area: 'Shoulders & neck',  prompt: 'Drop your shoulders away from your ears. Let your neck lengthen and soften.' },
  { emoji: '😌', area: 'Face & head',       prompt: 'Relax your jaw, soften your forehead, and release the space behind your eyes.' },
];

function BodyScan() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  const advance = () => {
    if (step < BODY_STEPS.length - 1) setStep(s => s + 1);
    else setDone(true);
  };

  if (done) return <Wrap><Done message="Your body is calm. You are in control." /></Wrap>;

  const cur = BODY_STEPS[step];
  return (
    <Wrap>
      <ProgressBar total={BODY_STEPS.length} current={step + 1} />
      <Text style={es.stepCount}>{step + 1} / {BODY_STEPS.length}</Text>
      <View style={es.centreBlock}>
        <Text style={es.bigEmoji}>{cur.emoji}</Text>
        <Text style={es.areaLabel}>{cur.area}</Text>
        <Text style={es.promptTxt}>{cur.prompt}</Text>
      </View>
      <Btn label={step < BODY_STEPS.length - 1 ? 'Next area →' : 'Finish'} onPress={advance} />
    </Wrap>
  );
}

// ── 2. Muscle Relax ───────────────────────────────────────────────────────────

const MUSCLE_GROUPS = [
  { name: 'Hands',     emoji: '✊', tense: 'Clench your fists as tightly as you can.', release: 'Open your hands wide and let them relax completely.' },
  { name: 'Arms',      emoji: '💪', tense: 'Bend your arms and flex your biceps hard.', release: 'Let your arms drop and go completely limp.' },
  { name: 'Shoulders', emoji: '🙆', tense: 'Shrug your shoulders hard up to your ears.', release: 'Let your shoulders drop. Feel the difference.' },
  { name: 'Face',      emoji: '😬', tense: 'Scrunch your face as tight as you can.', release: 'Let your face go completely soft — jaw, forehead, eyes.' },
  { name: 'Belly',     emoji: '🫁', tense: 'Tighten your stomach muscles as hard as you can.', release: 'Let your belly soften and your breathing open up.' },
  { name: 'Legs',      emoji: '🦵', tense: 'Press your feet into the floor and tense your whole legs.', release: 'Let your legs go heavy and completely relaxed.' },
];

const TENSE_SECS = 5;
const RELEASE_SECS = 8;

function MuscleRelax() {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'tense' | 'release' | 'done'>('ready');
  const [count, setCount] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => { if (timer.current) clearInterval(timer.current); };

  const startTense = useCallback(() => {
    setPhase('tense');
    setCount(TENSE_SECS);
    timer.current = setInterval(() => {
      setCount(c => {
        if (c <= 1) {
          clearInterval(timer.current!);
          setPhase('release');
          setCount(RELEASE_SECS);
          timer.current = setInterval(() => {
            setCount(cc => {
              if (cc <= 1) {
                clearInterval(timer.current!);
                if (step < MUSCLE_GROUPS.length - 1) {
                  setStep(s => s + 1);
                  setPhase('ready');
                } else {
                  setPhase('done');
                }
                return 0;
              }
              return cc - 1;
            });
          }, 1000);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [step]);

  useEffect(() => () => clearTimer(), []);

  if (phase === 'done') return <Wrap><Done message="Excellent. Your muscles are relaxed. You did great." /></Wrap>;

  const g = MUSCLE_GROUPS[step];
  return (
    <Wrap>
      <ProgressBar total={MUSCLE_GROUPS.length} current={step + 1} />
      <Text style={es.stepCount}>{step + 1} / {MUSCLE_GROUPS.length} — {g.name}</Text>
      <View style={es.centreBlock}>
        <Text style={es.bigEmoji}>{g.emoji}</Text>
        {phase === 'ready' && (
          <>
            <Text style={es.promptTxt}>{g.tense}</Text>
            <Btn label="Start — Tense now" onPress={startTense} />
          </>
        )}
        {phase === 'tense' && (
          <>
            <Text style={[es.promptTxt, { color: '#c0392b', fontWeight: '700' }]}>Tense! Hold it...</Text>
            <Text style={es.bigCount}>{count}s</Text>
          </>
        )}
        {phase === 'release' && (
          <>
            <Text style={[es.promptTxt, { color: '#0a7a4e', fontWeight: '700' }]}>{g.release}</Text>
            <Text style={es.bigCount}>{count}s</Text>
          </>
        )}
      </View>
    </Wrap>
  );
}

// ── 3. Gratitude ──────────────────────────────────────────────────────────────

const GRATITUDE_PLACEHOLDERS = [
  'A person in your life…',
  'Something around you right now…',
  'Something about yourself…',
];

function Gratitude() {
  const [vals, setVals] = useState(['', '', '']);
  const [done, setDone] = useState(false);

  const set = (i: number, v: string) =>
    setVals(prev => prev.map((x, idx) => (idx === i ? v : x)));
  const canSubmit = vals.every(v => v.trim().length > 0);

  if (done) {
    return (
      <Wrap>
        <Text style={es.gratitudeTitle}>Your gratitudes today</Text>
        {vals.map((v, i) => (
          <View key={i} style={es.gratitudeItem}>
            <Text style={es.gratitudeNum}>{i + 1}</Text>
            <Text style={es.gratitudeVal}>{v}</Text>
          </View>
        ))}
        <Text style={es.gratitudeClosure}>These things are real, and they matter. 🙏</Text>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <Text style={es.gratitudeTitle}>Name three things you are grateful for right now.</Text>
      <Text style={es.subtleSub}>They don't need to be big. Anything counts.</Text>
      {vals.map((v, i) => (
        <View key={i} style={es.gratitudeInputRow}>
          <Text style={es.gratitudeInputNum}>{i + 1}.</Text>
          <TextInput
            style={es.gratitudeInput}
            value={v}
            onChangeText={t => set(i, t)}
            placeholder={GRATITUDE_PLACEHOLDERS[i]}
            placeholderTextColor="#aaa"
            maxLength={100}
          />
        </View>
      ))}
      <Btn label="Done" onPress={() => setDone(true)} disabled={!canSubmit} />
    </Wrap>
  );
}

// ── 4. Affirmations ───────────────────────────────────────────────────────────

const AFFIRMATIONS = [
  "I am stronger than this urge.",
  "Every moment I resist, I grow stronger.",
  "I choose freedom over a temporary rush.",
  "My family deserves the best version of me.",
  "I am healing — one moment at a time.",
  "I have the power to change my story.",
  "This urge will pass. I just need to wait.",
  "I am worth so much more than any bet.",
  "Each day without gambling is a victory.",
  "I am building the life I deserve.",
  "My future self will thank me for this.",
  "I am not alone in this. I can do this.",
];

function Affirmations() {
  const [idx, setIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const next = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setIdx(i => (i + 1) % AFFIRMATIONS.length);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  return (
    <Wrap>
      <Text style={es.subtleSub}>Tap the card to see the next affirmation</Text>
      <Pressable onPress={next} style={es.affirmCard}>
        <Animated.Text style={[es.affirmText, { opacity: fadeAnim }]}>
          "{AFFIRMATIONS[idx]}"
        </Animated.Text>
      </Pressable>
      <Text style={es.affirmCounter}>{idx + 1} / {AFFIRMATIONS.length}</Text>
    </Wrap>
  );
}

// ── 5. Urge Surfing ───────────────────────────────────────────────────────────

const SURF_STEPS = [
  { title: 'Notice',   desc: "An urge has arrived. Don't fight it — just notice it. Where do you feel it in your body? Your chest? Hands? Stomach?" },
  { title: 'Breathe',  desc: "Take one slow, deep breath in through your nose... and out through your mouth. The urge is a wave. It will rise, peak, and fade." },
  { title: 'Observe',  desc: "Watch the urge without judging it. It's just a feeling — not a command. You are the observer. You are not the urge." },
  { title: 'The peak', desc: "Urges are strongest right now. Research shows most last 15–30 minutes. You are doing the hardest part. Stay with it." },
  { title: 'Easing',   desc: "Notice how the feeling is starting to shift. You haven't acted on it. The wave is beginning to break on the shore." },
  { title: 'Release',  desc: "You surfed it. The urge is fading. This is what strength feels like — not the absence of urges, but riding them out." },
];

function UrgeSurfing() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  if (done) return <Wrap><Done message="You rode out the wave. That is real strength." /></Wrap>;

  const cur = SURF_STEPS[step];
  return (
    <Wrap>
      <ProgressBar total={SURF_STEPS.length} current={step + 1} />
      <View style={es.storyCard}>
        <Text style={es.storyTitle}>{cur.title}</Text>
        <Text style={es.storyDesc}>{cur.desc}</Text>
      </View>
      <Btn
        label={step < SURF_STEPS.length - 1 ? 'Next →' : 'I rode it out ✓'}
        onPress={() => step < SURF_STEPS.length - 1 ? setStep(s => s + 1) : setDone(true)}
      />
    </Wrap>
  );
}

// ── 6. STOP ───────────────────────────────────────────────────────────────────

const STOP_STEPS = [
  { letter: 'S', word: 'Stop',           color: '#c0392b', desc: "Whatever you are doing — pause. Right now, in this moment, just stop." },
  { letter: 'T', word: 'Take a breath',  color: '#e67e22', desc: "One slow breath in through your nose... hold for a moment... and out through your mouth." },
  { letter: 'O', word: 'Observe',        color: '#2980b9', desc: "What are you feeling right now? Name it. Where is it in your body? What set it off?" },
  { letter: 'P', word: 'Proceed',        color: '#27ae60', desc: "Now, what is the wisest choice you can make in this moment? You already know the answer." },
];

function Stop() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  if (done) return <Wrap><Done message="Well done. You used the STOP technique. That takes real awareness." /></Wrap>;

  const cur = STOP_STEPS[step];
  return (
    <Wrap>
      <ProgressBar total={4} current={step + 1} />
      <View style={[es.stopCard, { borderColor: cur.color }]}>
        <Text style={[es.stopLetter, { color: cur.color }]}>{cur.letter}</Text>
        <Text style={es.stopWord}>{cur.word}</Text>
        <Text style={es.storyDesc}>{cur.desc}</Text>
      </View>
      <Btn
        label={step < 3 ? 'Next →' : 'Done ✓'}
        color={cur.color}
        onPress={() => step < 3 ? setStep(s => s + 1) : setDone(true)}
      />
    </Wrap>
  );
}

// ── 7. Visualise ──────────────────────────────────────────────────────────────

const VIS_STEPS = [
  { title: 'Close your eyes', desc: "Take a slow breath. When you're ready, picture yourself one year from today — having kept your promise to yourself." },
  { title: 'See it clearly',  desc: "What does your life look like? Your finances. Your relationships. How do you feel waking up each morning?" },
  { title: 'Feel the freedom', desc: "No guilt. No secrets. No counting losses. Just you, free from the grip of gambling." },
  { title: 'Hold it',         desc: "That future is real. It's waiting for you. Every moment you resist brings you one step closer to it." },
  { title: 'Come back',       desc: "Open your eyes. You just visited your future self. That person is counting on the choice you make right now." },
];

function Visualise() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  if (done) return <Wrap><Done message="Your future self is counting on you. You have got this." /></Wrap>;

  const cur = VIS_STEPS[step];
  return (
    <Wrap>
      <ProgressBar total={VIS_STEPS.length} current={step + 1} />
      <View style={es.storyCard}>
        <Text style={es.storyTitle}>{cur.title}</Text>
        <Text style={es.storyDesc}>{cur.desc}</Text>
      </View>
      <Btn
        label={step < VIS_STEPS.length - 1 ? 'Continue →' : 'I am ready ✓'}
        onPress={() => step < VIS_STEPS.length - 1 ? setStep(s => s + 1) : setDone(true)}
      />
    </Wrap>
  );
}

// ── 8. Worry Drop ─────────────────────────────────────────────────────────────

function WorryDrop() {
  const [text, setText] = useState('');
  const [dropped, setDropped] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const drop = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 600, useNativeDriver: true }).start(() =>
      setDropped(true)
    );
  };

  if (dropped) return <Wrap><Done message="You named it and let it go. It has no power here." /></Wrap>;

  return (
    <Wrap>
      <Text style={es.gratitudeTitle}>What thought or worry is driving the urge?</Text>
      <Text style={es.subtleSub}>Write it down. Getting it out of your head weakens its power.</Text>
      <Animated.View style={{ opacity: fadeAnim }}>
        <TextInput
          style={es.worryInput}
          value={text}
          onChangeText={setText}
          placeholder="Write it here…"
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          maxLength={300}
        />
      </Animated.View>
      <Btn label="Drop it — let it go" onPress={drop} disabled={!text.trim()} />
    </Wrap>
  );
}

// ── 9. Breathing ─────────────────────────────────────────────────────────────

type BreathPhase = 'idle' | 'inhale' | 'hold' | 'exhale';

function BreathingExercise() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<BreathPhase>('idle');
  const breathScale = useRef(new Animated.Value(0.5)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
      breathScale.stopAnimation();
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, [breathScale]);

  const runCycle = useCallback(() => {
    if (!mounted.current) return;
    setPhase('inhale');
    Animated.timing(breathScale, { toValue: 1, duration: 4000, useNativeDriver: true }).start(({ finished }) => {
      if (!finished || !mounted.current) return;
      setPhase('hold');
      holdTimer.current = setTimeout(() => {
        if (!mounted.current) return;
        setPhase('exhale');
        Animated.timing(breathScale, { toValue: 0.5, duration: 4000, useNativeDriver: true }).start(({ finished: f }) => {
          if (f && mounted.current) runCycle();
        });
      }, 4000);
    });
  }, [breathScale]);

  const start = () => { breathScale.setValue(0.5); setRunning(true); runCycle(); };
  const stop = () => {
    breathScale.stopAnimation(); breathScale.setValue(0.5);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setRunning(false); setPhase('idle');
  };

  const phaseLabel = phase === 'inhale' ? 'Breathe in...' : phase === 'hold' ? 'Hold...' : phase === 'exhale' ? 'Breathe out...' : 'Tap to start';

  return (
    <Wrap>
      <Text style={es.subtleSub}>4 seconds in · 4 seconds hold · 4 seconds out</Text>
      <View style={es.breathRing}>
        <Animated.View style={[es.breathCircle, { transform: [{ scale: breathScale }] }]} />
        <Text style={es.breathLabel}>{phaseLabel}</Text>
      </View>
      <Pressable
        style={[es.btn, { backgroundColor: running ? '#888' : '#0F6E6E' }]}
        onPress={running ? stop : start}>
        <Text style={es.btnTxt}>{running ? 'Stop' : 'Start breathing'}</Text>
      </Pressable>
    </Wrap>
  );
}

// ── Render router ─────────────────────────────────────────────────────────────

export function renderExercise(key: ExerciseKey): React.ReactNode {
  switch (key) {
    case 'breathing':    return <BreathingExercise />;
    case 'body_scan':    return <BodyScan />;
    case 'muscle_relax': return <MuscleRelax />;
    case 'gratitude':    return <Gratitude />;
    case 'affirmations': return <Affirmations />;
    case 'urge_surfing': return <UrgeSurfing />;
    case 'stop':         return <Stop />;
    case 'visualise':    return <Visualise />;
    case 'worry_drop':   return <WorryDrop />;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const es = StyleSheet.create({
  wrap: { flex: 1, padding: 20, gap: 16 },

  btn: { borderRadius: 24, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center', marginTop: 4 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  progressTrack: { height: 4, backgroundColor: '#e0f0f0', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: '#0F6E6E', borderRadius: 2 },
  stepCount: { fontSize: 12, color: '#888', textAlign: 'center' },

  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 40 },
  doneIcon: { fontSize: 52, color: '#0a7a4e' },
  doneTxt: { fontSize: 17, fontWeight: '600', color: '#333', textAlign: 'center', lineHeight: 24 },

  centreBlock: { alignItems: 'center', gap: 12, paddingVertical: 20 },
  bigEmoji: { fontSize: 64 },
  areaLabel: { fontSize: 20, fontWeight: '700', color: '#0F6E6E' },
  promptTxt: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },
  bigCount: { fontSize: 56, fontWeight: '800', color: '#0F6E6E', textAlign: 'center' },

  subtleSub: { fontSize: 13, color: '#888', textAlign: 'center' },

  gratitudeTitle: { fontSize: 17, fontWeight: '700', color: '#111', textAlign: 'center' },
  gratitudeInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gratitudeInputNum: { fontSize: 16, fontWeight: '700', color: '#0F6E6E', width: 20 },
  gratitudeInput: {
    flex: 1, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111',
  },
  gratitudeItem: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  gratitudeNum: { fontSize: 22, fontWeight: '800', color: '#0F6E6E', width: 28 },
  gratitudeVal: { flex: 1, fontSize: 16, color: '#333', lineHeight: 22, paddingTop: 2 },
  gratitudeClosure: { fontSize: 14, color: '#888', textAlign: 'center', fontStyle: 'italic' },

  affirmCard: {
    backgroundColor: '#e6f7f7', borderRadius: 16, padding: 28,
    alignItems: 'center', minHeight: 160, justifyContent: 'center',
    borderWidth: 1, borderColor: '#a8d8d0',
  },
  affirmText: { fontSize: 20, fontWeight: '600', color: '#0F6E6E', textAlign: 'center', lineHeight: 30 },
  affirmCounter: { fontSize: 12, color: '#aaa', textAlign: 'center' },

  storyCard: {
    backgroundColor: '#f4fafa', borderRadius: 14, padding: 20, gap: 10,
    borderLeftWidth: 4, borderLeftColor: '#0F6E6E',
  },
  storyTitle: { fontSize: 20, fontWeight: '800', color: '#0F6E6E' },
  storyDesc: { fontSize: 15, color: '#333', lineHeight: 23, textAlign: 'center' },

  stopCard: { borderRadius: 14, padding: 24, gap: 8, borderWidth: 2, alignItems: 'center', backgroundColor: '#fafafa' },
  stopLetter: { fontSize: 64, fontWeight: '900', lineHeight: 72 },
  stopWord: { fontSize: 22, fontWeight: '700', color: '#111' },

  worryInput: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 14, fontSize: 15, color: '#111', minHeight: 130,
  },

  breathRing: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  breathCircle: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#e6f7f7', borderWidth: 3, borderColor: '#0F6E6E',
  },
  breathLabel: { fontSize: 16, fontWeight: '600', color: '#0F6E6E', textAlign: 'center' },
});

