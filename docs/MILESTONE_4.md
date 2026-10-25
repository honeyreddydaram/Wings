# Milestone 4 — Conversational Difficulty Detection

## Implemented scope

- A local detector consumes microphone metering samples in an independent four-second window and keeps up to 30 seconds of scalar history.
- The detector derives an adaptive noise floor, voice activity, trailing pause, energy variation, speaking-rate estimate, filler count, and repeated-phrase count.
- Transcript text is converted immediately into bounded counts; the detector retains no words, raw audio, or reconstructable feature stream and emits no telemetry.
- Scores are bounded to `low`, `medium`, and `high`. Steady noise without recent transcript activity cannot trigger assistance.
- Automatic suggestions are separately opted in for each session and require recording awareness to be confirmed first.
- The intervention policy requires two consecutive high windows and 65% confidence. It enforces a five-second interaction quiet period, 45-second cooldown, three-cue session cap, and suppression while voice output or recorder transitions are active.
- Manual **Get me unstuck** remains available with automatic assistance disabled.
- An automatic cue explains the observed product-level reason and states that the signal is rough and non-diagnostic.

## Synthetic evaluation

Deterministic fixtures cover silence, variable crowd-like levels, steady music-like levels, filler/repetition plus a long pause, opt-out, assistant speech, recorder transition, and cooldown. The three negative fixtures do not trigger. Tests also verify that transcript strings are absent from serialized detector state.

These fixtures establish policy behavior; they do not establish real-world accuracy. No consented human recordings are included in the repository.

## External validation still required

- Calibrate thresholds on several Android microphones and voices in quiet, crowd, and music conditions.
- Measure false positives, missed useful moments, end-to-end trigger latency, energy use, and cooldown acceptance at the venue.
- Confirm that Expo metering values are stable across devices and that Bluetooth/headphone routing does not distort the scalar signal.
- Obtain explicit consent before collecting any evaluation recording and define retention/deletion before capture.

The signal estimates when a gentle suggestion might be useful. It must never be described as detecting anxiety, stress, emotion, intent, health, or any protected characteristic.

## Milestone 5 handoff

Milestone 5 can consume the bounded `low`/`medium`/`high` state and the fact that a user requested or accepted help. It should not receive precise detector features or treat the score as personal truth. Recent conversation remains the primary basis for generated cues.
