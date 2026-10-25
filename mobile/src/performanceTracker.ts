export const PERFORMANCE_TARGETS = {
  transcriptP95Ms: 8_000,
  cueP95Ms: 5_000,
  transcriptionLossRate: 0.05,
  providerErrorRate: 0.05,
} as const;

export type PerformanceSnapshot = {
  transcriptP95Ms: number | null;
  cueP95Ms: number | null;
  transcriptionLossRate: number;
  providerErrorRate: number;
  audioAttempts: number;
  cueAttempts: number;
};

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * fraction) - 1];
}

export class PerformanceTracker {
  private transcriptLatencies: number[] = [];
  private cueLatencies: number[] = [];
  private audioAttempts = 0;
  private audioFailures = 0;
  private cueAttempts = 0;
  private cueFailures = 0;

  beginAudio(): void { this.audioAttempts += 1; }
  finishAudio(capturedAtMs: number, finishedAtMs = Date.now()): void {
    this.transcriptLatencies.push(Math.max(0, finishedAtMs - capturedAtMs));
    this.transcriptLatencies = this.transcriptLatencies.slice(-100);
  }
  ignoreAudio(): void { this.audioAttempts = Math.max(0, this.audioAttempts - 1); }
  failAudio(): void { this.audioFailures += 1; }
  beginCue(): void { this.cueAttempts += 1; }
  finishCue(startedAtMs: number, finishedAtMs = Date.now()): void {
    this.cueLatencies.push(Math.max(0, finishedAtMs - startedAtMs));
    this.cueLatencies = this.cueLatencies.slice(-100);
  }
  failCue(): void { this.cueFailures += 1; }
  reset(): void {
    this.transcriptLatencies = [];
    this.cueLatencies = [];
    this.audioAttempts = this.audioFailures = this.cueAttempts = this.cueFailures = 0;
  }
  snapshot(): PerformanceSnapshot {
    return {
      transcriptP95Ms: percentile(this.transcriptLatencies, 0.95),
      cueP95Ms: percentile(this.cueLatencies, 0.95),
      transcriptionLossRate: this.audioAttempts ? this.audioFailures / this.audioAttempts : 0,
      providerErrorRate: this.cueAttempts ? this.cueFailures / this.cueAttempts : 0,
      audioAttempts: this.audioAttempts,
      cueAttempts: this.cueAttempts,
    };
  }
}
