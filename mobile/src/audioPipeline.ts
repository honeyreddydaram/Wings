import { useCallback, useRef, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import type { RecordingStatus } from "expo-audio";

export type AudioPipelinePhase = "idle" | "recording" | "paused" | "error";

type Options = {
  chunkSeconds: number;
  onChunk: (
    uri: string,
    chunkIndex: number,
    capturedAtMs: number,
  ) => Promise<void>;
  onError: (message: string) => void;
};

export function useRollingAudioPipeline({
  chunkSeconds,
  onChunk,
  onError,
}: Options) {
  const [phase, setPhase] = useState<AudioPipelinePhase>("idle");
  const [pendingChunks, setPendingChunks] = useState(0);
  const enabled = useRef(false);
  const discardFinishedChunk = useRef(false);
  const chunkIndex = useRef(0);
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());
  const onChunkRef = useRef(onChunk);
  const onErrorRef = useRef(onError);
  const finishedRef = useRef<(status: RecordingStatus) => void>(
    () => undefined,
  );
  onChunkRef.current = onChunk;
  onErrorRef.current = onError;

  const recorder = useAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true },
    (status) => finishedRef.current(status),
  );
  const recorderState = useAudioRecorderState(recorder, 250);

  const beginChunk = useCallback(async () => {
    if (!enabled.current) return;
    try {
      await recorder.prepareToRecordAsync();
      if (!enabled.current) return;
      recorder.record({ forDuration: chunkSeconds });
      setPhase("recording");
    } catch (error: any) {
      enabled.current = false;
      setPhase("error");
      onErrorRef.current(error?.message || "The microphone could not start.");
    }
  }, [chunkSeconds, recorder]);

  finishedRef.current = (status) => {
    if (status.hasError) {
      enabled.current = false;
      setPhase("error");
      onErrorRef.current(
        status.error || "Audio recording stopped unexpectedly.",
      );
      return;
    }

    const shouldUpload = !discardFinishedChunk.current;
    discardFinishedChunk.current = false;
    if (enabled.current) void beginChunk();
    else setPhase("paused");

    if (!status.url || !shouldUpload) return;
    const currentIndex = chunkIndex.current++;
    const capturedAtMs = Date.now();
    setPendingChunks((count) => count + 1);
    uploadQueue.current = uploadQueue.current
      .then(() => onChunkRef.current(status.url!, currentIndex, capturedAtMs))
      .catch((error: any) => {
        onErrorRef.current(
          error?.message || "An audio chunk could not be transcribed.",
        );
      })
      .finally(() => setPendingChunks((count) => Math.max(0, count - 1)));
  };

  const start = useCallback(async () => {
    if (enabled.current) return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        "Microphone permission is needed to listen. You can type instead.",
      );
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    enabled.current = true;
    discardFinishedChunk.current = false;
    await beginChunk();
  }, [beginChunk]);

  const pause = useCallback(
    async (discardCurrent = false) => {
      enabled.current = false;
      discardFinishedChunk.current = discardCurrent;
      if (recorder.isRecording) await recorder.stop();
      setPhase("paused");
    },
    [recorder],
  );

  const flush = useCallback(async () => {
    await uploadQueue.current;
  }, []);

  const reset = useCallback(() => {
    enabled.current = false;
    discardFinishedChunk.current = false;
    chunkIndex.current = 0;
    setPhase("idle");
  }, []);

  return {
    phase,
    pendingChunks,
    metering: recorderState.metering,
    start,
    pause,
    flush,
    reset,
  };
}
