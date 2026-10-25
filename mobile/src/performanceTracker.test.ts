import { describe, expect, it } from "vitest";
import { PerformanceTracker } from "./performanceTracker";

describe("PerformanceTracker", () => {
  it("computes bounded p95 and failure rates", () => {
    const tracker = new PerformanceTracker();
    for (let index = 0; index < 20; index += 1) {
      tracker.beginAudio();
      if (index === 0) tracker.failAudio();
      else tracker.finishAudio(1_000, 1_100 + index);
    }
    tracker.beginCue();
    tracker.finishCue(1_000, 1_400);
    tracker.beginCue();
    tracker.failCue();
    const snapshot = tracker.snapshot();
    expect(snapshot.transcriptP95Ms).toBe(119);
    expect(snapshot.cueP95Ms).toBe(400);
    expect(snapshot.transcriptionLossRate).toBe(0.05);
    expect(snapshot.providerErrorRate).toBe(0.5);
  });

  it("resets without inventing measurements", () => {
    const tracker = new PerformanceTracker();
    tracker.beginAudio();
    tracker.failAudio();
    tracker.reset();
    expect(tracker.snapshot()).toMatchObject({
      transcriptP95Ms: null, cueP95Ms: null, audioAttempts: 0, cueAttempts: 0,
    });
  });
});
