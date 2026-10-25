export type AssistanceLevel = "low" | "medium" | "high";

export type DifficultySnapshot = {
  level: AssistanceLevel;
  confidence: number;
  explanation: string;
  triggered: boolean;
};

export type InterventionContext = {
  optedIn: boolean;
  assistantSpeaking: boolean;
  recorderTransitioning: boolean;
  nowMs: number;
};

type MeterSample = { atMs: number; db: number };
type TranscriptEvent = { atMs: number; wordCount: number; fillers: number; repeats: number };

const WINDOW_MS = 4_000;
const HISTORY_MS = 30_000;
const EVALUATION_MS = 1_000;
const RECENT_INTERACTION_MS = 5_000;
const COOLDOWN_MS = 45_000;
const SESSION_CAP = 3;

const FILLERS = new Set(["um", "uh", "erm", "hmm", "maybe", "sorry"]);

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function wordsIn(text: string) {
  return (text.toLowerCase().match(/[a-z']+/g) || []).slice(0, 120);
}

function repetitionCount(words: string[]) {
  let repeats = 0;
  for (let index = 1; index < words.length; index += 1) {
    if (words[index] === words[index - 1]) repeats += 1;
  }
  for (let index = 4; index < words.length; index += 1) {
    if (words[index] === words[index - 2] && words[index - 1] === words[index - 3]) repeats += 1;
  }
  return repeats;
}

/**
 * Keeps only derived microphone levels and bounded word features. Raw audio and
 * transcript strings never enter this detector.
 */
export class DifficultyDetector {
  private meter: MeterSample[] = [];
  private transcript: TranscriptEvent[] = [];
  private lastEvaluationMs = 0;
  private lastInteractionMs = 0;
  private lastInterventionMs = -Infinity;
  private highWindows = 0;
  private interventions = 0;

  reset(nowMs = 0) {
    this.meter = [];
    this.transcript = [];
    this.lastEvaluationMs = 0;
    this.lastInteractionMs = nowMs;
    this.lastInterventionMs = -Infinity;
    this.highWindows = 0;
    this.interventions = 0;
  }

  noteInteraction(nowMs: number) {
    this.lastInteractionMs = nowMs;
    this.highWindows = 0;
  }

  observeTranscript(text: string, atMs: number) {
    const words = wordsIn(text);
    if (!words.length) return;
    this.transcript.push({
      atMs,
      wordCount: words.length,
      fillers: words.filter((word) => FILLERS.has(word)).length,
      repeats: repetitionCount(words),
    });
    this.trim(atMs);
  }

  observeMeter(db: number, context: InterventionContext): DifficultySnapshot | null {
    const nowMs = context.nowMs;
    this.meter.push({ atMs: nowMs, db: clamp(db, -100, 0) });
    this.trim(nowMs);
    if (nowMs - this.lastEvaluationMs < EVALUATION_MS) return null;
    this.lastEvaluationMs = nowMs;
    return this.evaluate(context);
  }

  evaluate(context: InterventionContext): DifficultySnapshot {
    const nowMs = context.nowMs;
    this.trim(nowMs);
    const recentMeter = this.meter.filter((sample) => sample.atMs >= nowMs - WINDOW_MS);
    const recentTranscript = this.transcript.filter((event) => event.atMs >= nowMs - HISTORY_MS);
    const wordCount = recentTranscript.reduce((total, event) => total + event.wordCount, 0);
    const hasConversation = wordCount > 0;

    // Adapt to the device/noise floor using recent scalar levels. Requiring
    // transcript activity prevents steady crowd noise or music from triggering.
    const sorted = recentMeter.map((sample) => sample.db).sort((a, b) => a - b);
    const noiseFloor = sorted.length ? sorted[Math.floor(sorted.length * 0.2)] : -60;
    const voiceThreshold = Math.max(-45, noiseFloor + 10);
    const voiced = recentMeter.filter((sample) => sample.db >= voiceThreshold);
    const lastVoice = [...this.meter].reverse().find((sample) => sample.db >= voiceThreshold)?.atMs;
    const pauseMs = lastVoice === undefined ? 0 : Math.max(0, nowMs - lastVoice);
    const fillers = recentTranscript.reduce((total, event) => total + event.fillers, 0);
    const repeats = recentTranscript.reduce((total, event) => total + event.repeats, 0);
    const transcriptSpan = recentTranscript.length > 1
      ? Math.max(1, recentTranscript.at(-1)!.atMs - recentTranscript[0].atMs)
      : HISTORY_MS;
    const wordsPerMinute = wordCount * 60_000 / transcriptSpan;
    const mean = voiced.length ? voiced.reduce((sum, sample) => sum + sample.db, 0) / voiced.length : 0;
    const variation = voiced.length > 1
      ? Math.sqrt(voiced.reduce((sum, sample) => sum + (sample.db - mean) ** 2, 0) / voiced.length)
      : 0;

    let score = 0;
    const reasons: string[] = [];
    if (hasConversation && pauseMs >= 2_500) {
      score += clamp((pauseMs - 1_500) / 3_500) * 0.55;
      reasons.push("a longer pause");
    }
    if (fillers >= 2) {
      score += clamp(fillers / 5) * 0.28;
      reasons.push("several filler words");
    }
    if (repeats >= 1) {
      score += clamp(repeats / 3) * 0.22;
      reasons.push("repeated phrasing");
    }
    if (hasConversation && wordCount >= 4 && wordsPerMinute < 55) {
      score += 0.12;
      reasons.push("a slower speaking pace");
    }
    if (hasConversation && voiced.length >= 3 && variation < 1.5) score += 0.05;
    score = clamp(score);

    const level: AssistanceLevel = score >= 0.65 ? "high" : score >= 0.35 ? "medium" : "low";
    const suppressed =
      !context.optedIn ||
      context.assistantSpeaking ||
      context.recorderTransitioning ||
      nowMs - this.lastInteractionMs < RECENT_INTERACTION_MS ||
      nowMs - this.lastInterventionMs < COOLDOWN_MS ||
      this.interventions >= SESSION_CAP;
    this.highWindows = suppressed || level === "low"
      ? 0
      : level === "high"
        ? this.highWindows + 1
        : this.highWindows;
    const triggered = level === "high" && score >= 0.65 && this.highWindows >= 2 && !suppressed;
    if (triggered) {
      this.lastInterventionMs = nowMs;
      this.interventions += 1;
      this.highWindows = 0;
    }

    return {
      level,
      confidence: Math.round(score * 100) / 100,
      explanation: reasons.length
        ? `A gentle suggestion appeared after ${reasons.slice(0, 2).join(" and ")}. This is a rough conversation signal, not a diagnosis.`
        : "No strong assistance signal right now. This is a rough conversation signal, not a diagnosis.",
      triggered,
    };
  }

  private trim(nowMs: number) {
    this.meter = this.meter.filter((sample) => sample.atMs >= nowMs - HISTORY_MS);
    this.transcript = this.transcript.filter((event) => event.atMs >= nowMs - HISTORY_MS);
  }
}
