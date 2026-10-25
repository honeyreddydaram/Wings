import { describe, expect, it } from "vitest";
import { DifficultyDetector } from "./difficultyDetector";

function context(nowMs: number, optedIn = true) {
  return { nowMs, optedIn, assistantSpeaking: false, recorderTransitioning: false };
}

function speech(detector: DifficultyDetector, start = 10_000) {
  detector.observeTranscript("um maybe I I could explain that", start);
  for (let offset = 0; offset <= 1_000; offset += 250) {
    detector.observeMeter(-25, context(start + offset));
  }
}

describe("DifficultyDetector", () => {
  it("does not trigger on silence, crowd noise, or music without conversation", () => {
    for (const levels of [[-90, -90, -90, -90], [-24, -18, -27, -20], [-20, -20, -20, -20]]) {
      const detector = new DifficultyDetector();
      let result = detector.evaluate(context(8_000));
      levels.forEach((db, index) => {
        result = detector.observeMeter(db, context(10_000 + index * 1_100)) || result;
      });
      expect(result.triggered).toBe(false);
      expect(result.level).toBe("low");
    }
  });

  it("requires opt-in and two high windows after a recent interaction", () => {
    const detector = new DifficultyDetector();
    detector.reset(0);
    speech(detector);
    const first = detector.evaluate(context(17_000, false));
    const second = detector.evaluate(context(18_100, false));
    expect(first.level).toBe("high");
    expect(second.triggered).toBe(false);
    expect(detector.evaluate(context(19_200, true)).triggered).toBe(false);
    expect(detector.evaluate(context(20_300, true)).triggered).toBe(true);
  });

  it("suppresses cues while speaking, transitioning, and during cooldown", () => {
    const detector = new DifficultyDetector();
    speech(detector);
    detector.evaluate(context(17_000));
    expect(detector.evaluate({ ...context(18_100), assistantSpeaking: true }).triggered).toBe(false);
    expect(detector.evaluate({ ...context(19_200), recorderTransitioning: true }).triggered).toBe(false);
    expect(detector.evaluate(context(20_300)).triggered).toBe(false);
    expect(detector.evaluate(context(21_400)).triggered).toBe(true);
    detector.evaluate(context(22_500));
    expect(detector.evaluate(context(23_600)).triggered).toBe(false);
  });

  it("caps automatic interventions at three per session", () => {
    const detector = new DifficultyDetector();
    let triggers = 0;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const start = 10_000 + cycle * 60_000;
      speech(detector, start);
      detector.evaluate(context(start + 7_000));
      if (detector.evaluate(context(start + 8_100)).triggered) triggers += 1;
    }
    expect(triggers).toBe(3);
  });

  it("bounds transcript-derived features and avoids retaining transcript strings", () => {
    const detector = new DifficultyDetector();
    detector.observeTranscript("hello hello um um", 10_000);
    const result = detector.evaluate(context(14_000));
    expect(result.confidence).toBeGreaterThan(0);
    expect(JSON.stringify(detector)).not.toContain("hello");
  });
});
