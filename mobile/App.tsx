import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  Switch,
  Linking,
  Share,
  Alert,
  AppState,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { useRollingAudioPipeline } from "./src/audioPipeline";
import {
  DifficultyDetector,
  DifficultySnapshot,
} from "./src/difficultyDetector";
import {
  firebaseConfigured,
  getIdentityToken,
  observeAuth,
  signIn,
  signOutUser,
  signUp,
  User,
} from "./src/auth";
import {
  clearActiveSession,
  loadActiveSession,
  saveActiveSession,
} from "./src/sessionStore";
import {
  PerformanceSnapshot,
  PerformanceTracker,
  PERFORMANCE_TARGETS,
} from "./src/performanceTracker";
import { DEMO_SCENARIO } from "./src/demoScenario";

type Cue = { id: string; category: string; text: string };
type Session = { id: string; token: string; mode: string; memory: string };
type Profile = {
  display_name: string;
  headline: string;
  organization: string;
  skills: string[];
  interests: string[];
  networking_goals: string;
  accomplishments: string;
  portfolio_url: string;
  resume_summary: string;
  email?: string | null;
  updated_at?: string | null;
};
type CardField =
  | "display_name"
  | "headline"
  | "organization"
  | "email"
  | "phone"
  | "website"
  | "bio";
type PublicCard = Record<CardField, string> & {
  public_url: string;
  updated_at?: string | null;
};
type DigitalCard = PublicCard & {
  published: boolean;
  slug: string;
  visibility: Record<CardField, boolean>;
};
type SavedContact = {
  id: string;
  source: "qr" | "link" | "vcard" | "manual";
  exchanged_at: string;
  snapshot: PublicCard;
  user_notes: string;
  conversation_note: string;
};
const CARD_FIELDS: { key: CardField; label: string; placeholder: string }[] = [
  { key: "display_name", label: "Name", placeholder: "Your public name" },
  { key: "headline", label: "Headline", placeholder: "What you do" },
  { key: "organization", label: "Organization", placeholder: "University or organization" },
  { key: "email", label: "Email", placeholder: "Public email" },
  { key: "phone", label: "Phone", placeholder: "Public phone (optional)" },
  { key: "website", label: "Website", placeholder: "https://…" },
  { key: "bio", label: "Short bio", placeholder: "A brief introduction" },
];
const EMPTY_CARD: DigitalCard = {
  display_name: "", headline: "", organization: "", email: "", phone: "", website: "", bio: "",
  published: false, visibility: Object.fromEntries(CARD_FIELDS.map(({ key }) => [key, true])) as Record<CardField, boolean>,
  public_url: "", slug: "",
};
const EMPTY_PROFILE: Profile = {
  display_name: "",
  headline: "",
  organization: "",
  skills: [],
  interests: [],
  networking_goals: "",
  accomplishments: "",
  portfolio_url: "",
  resume_summary: "",
};
const POPULAR_SKILLS = [
  "Python",
  "TypeScript / React",
  "Generative AI & LLMs",
  "Cloud & GCP Architecture",
  "Machine Learning & PyTorch",
  "FastAPI & Backend APIs",
  "Mobile Apps (React Native)",
  "Data Engineering & SQL",
  "Docker & Kubernetes",
  "System Design & DevOps",
];

const POPULAR_INTERESTS = [
  "Autonomous AI Agents",
  "Edge AI & Embedded Systems",
  "Humanoid Robotics",
  "Open-Source Models (Gemma)",
  "Real-Time Speech & Audio AI",
  "Startup Pitching & VC",
  "Platform Engineering",
  "Cybersecurity & Privacy",
  "Developer Tooling",
  "Tech Networking & Hackathons",
];

const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
const AUDIO_CHUNK_SECONDS = Math.min(
  10,
  Math.max(2, Number(process.env.EXPO_PUBLIC_AUDIO_CHUNK_SECONDS) || 4),
);
const C = {
  bg: "#F7F8F4",
  ink: "#203D32",
  muted: "#59675E",
  green: "#34654E",
  pale: "#EDF2EA",
  line: "#E1E6DD",
  white: "#FFFFFF",
  orange: "#8A5A25",
};
const SAMPLE = DEMO_SCENARIO.transcript;
function Icon({
  name,
  size = 20,
  color = C.green,
}: {
  name: any;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export default function App() {
  const { width } = useWindowDimensions();
  const wide = width > 1000;
  const [page, setPage] = useState("session");
  const [name, setName] = useState<string>(DEMO_SCENARIO.partnerName);
  const [context, setContext] = useState<string>(DEMO_SCENARIO.context);
  const [contact, setContact] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voice, setVoice] = useState(true);
  const [remember, setRemember] = useState(false);
  const [signal, setSignal] = useState("low");
  const [ended, setEnded] = useState<{
    summary: string;
    follow_up?: string;
    saved: boolean;
  } | null>(null);
  const [recordingConsent, setRecordingConsent] = useState(true);
  const [autoAssist, setAutoAssist] = useState(true);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultySnapshot>({
    level: "low",
    confidence: 0,
    explanation:
      "No strong assistance signal right now. This is a rough conversation signal, not a diagnosis.",
    triggered: false,
  });
  const [automaticExplanation, setAutomaticExplanation] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [owner, setOwner] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [card, setCard] = useState<DigitalCard>(EMPTY_CARD);
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [scannedCard, setScannedCard] = useState<PublicCard | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const difficultyDetector = useRef(new DifficultyDetector());
  const autoAssistRef = useRef(false);
  const assistantSpeakingRef = useRef(false);
  const busyRef = useRef(false);
  const cuesRef = useRef<Cue[]>([]);
  cuesRef.current = cues;
  const automaticRequestPending = useRef(false);
  const recoveryAttemptedFor = useRef("");
  const performanceTracker = useRef(new PerformanceTracker());
  const [performance, setPerformance] = useState<PerformanceSnapshot>(
    performanceTracker.current.snapshot(),
  );
  const audio = useRollingAudioPipeline({
    chunkSeconds: AUDIO_CHUNK_SECONDS,
    onChunk: uploadAudioChunk,
    onError: (message) => setError(message),
  });
  const listening = audio.phase === "recording";
  autoAssistRef.current = autoAssist;
  assistantSpeakingRef.current = assistantSpeaking;
  busyRef.current = Boolean(busy);
  useEffect(() => {
    if (!listening || typeof audio.metering !== "number") return;
    const result = difficultyDetector.current.observeMeter(audio.metering, {
      optedIn: autoAssistRef.current,
      assistantSpeaking: assistantSpeakingRef.current,
      recorderTransitioning: busyRef.current || audio.phase !== "recording",
      nowMs: Date.now(),
    });
    if (!result) return;
    setDifficulty(result);
    if (result.triggered && !automaticRequestPending.current) {
      automaticRequestPending.current = true;
      setAutomaticExplanation(result.explanation);
      void getCues(true).finally(() => {
        automaticRequestPending.current = false;
      });
    }
  }, [audio.metering, listening]);
  useEffect(() => {
    void (async () => {
      let key = await AsyncStorage.getItem("cw-owner");
      if (!key) {
        key =
          "device-" +
          Array.from({ length: 48 }, () => Math.random().toString(36)[2]).join(
            "",
          );
        await AsyncStorage.setItem("cw-owner", key);
      }
      setOwner(key);
    })();
  }, []);
  useEffect(
    () =>
      observeAuth((user) => {
        setAuthUser(user);
        setAuthReady(true);
      }),
    [],
  );
  useEffect(() => {
    if (!authReady || !owner || (firebaseConfigured && !authUser)) return;
    void loadProfile();
  }, [authReady, owner, authUser?.uid]);
  useEffect(() => {
    const ownerId = firebaseConfigured ? authUser?.uid || "" : owner;
    if (!authReady || !ownerId || recoveryAttemptedFor.current === ownerId) return;
    recoveryAttemptedFor.current = ownerId;
    void (async () => {
      const stored = await loadActiveSession();
      if (!stored) return;
      if (stored.ownerId !== ownerId) {
        await clearActiveSession();
        return;
      }
      try {
        const response = await fetch(`${API}/session/${stored.session.id}/status`, {
          headers: { Authorization: `Bearer ${stored.session.token}` },
        });
        if (!response.ok) {
          if ([401, 410].includes(response.status)) await clearActiveSession();
          return;
        }
        const status = await response.json();
        setSession({ ...stored.session, mode: status.mode, memory: status.memory || "" });
        setSignal(status.signal || "low");
        setSeconds(Math.max(0, Math.floor((Date.now() - stored.startedAtMs) / 1000)));
        setNotice("Recovered your active session. The microphone stayed paused for privacy.");
      } catch {
        setNotice("An active session is saved securely, but it could not be verified while offline.");
      }
    })();
  }, [authReady, owner, authUser?.uid]);
  useEffect(() => {
    if (page !== "card" || !authReady || !owner || (firebaseConfigured && !authUser)) return;
    void loadExchange();
  }, [page, authReady, owner, authUser?.uid]);
  useEffect(() => {
    if (!session || ended) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [session, ended]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && audio.phase === "recording") {
        void audio.pause(true);
        setNotice("Recording paused when Wings left the foreground. Tap the microphone to resume after confirming awareness.");
      }
    });
    return () => subscription.remove();
  }, [audio.phase, audio.pause]);
  async function api(
    path: string,
    body?: any,
    method = "POST",
    active: Session | null = session,
    identity = false,
  ) {
    const identityToken = identity ? await getIdentityToken() : null;
    const res = await fetch(API + path, {
      method,
      headers: {
        ...(active
          ? { Authorization: `Bearer ${active.token}` }
          : identityToken
            ? { Authorization: `Bearer ${identityToken}` }
            : {}),
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    });
    if (!res.ok) {
      if (active && [401, 410].includes(res.status)) {
        await clearActiveSession();
        setSession(null);
        setNotice("That session expired or could not be resumed. Start a new conversation when you’re ready.");
      }
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `Request failed (${res.status})`);
    }
    return res.json();
  }
  async function profileApi(body?: Profile, method = "GET") {
    const token = firebaseConfigured ? await getIdentityToken() : null;
    if (firebaseConfigured && !token)
      throw new Error("Sign in to access your profile.");
    const res = await fetch(API + "/profile/me", {
      method,
      headers: {
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : { "X-Demo-Owner": owner }),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(
        detail.detail || `Profile request failed (${res.status})`,
      );
    }
    return res.json();
  }
  async function identityFetch(path: string, init: RequestInit = {}) {
    const token = firebaseConfigured ? await getIdentityToken() : null;
    if (firebaseConfigured && !token) throw new Error("Sign in to access your account data.");
    const response = await fetch(API + path, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : { "X-Demo-Owner": owner }),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.detail || `Request failed (${response.status})`);
    }
    return response;
  }
  async function showPrivacyInventory() {
    await run("Reviewing stored data", async () => {
      const response = await identityFetch("/privacy/me");
      const data = await response.json();
      Alert.alert(
        "Stored data",
        `Profile: ${data.profile ? "yes" : "no"}\nCard: ${data.card ? "yes" : "no"}\nContacts: ${data.contacts}\nSessions awaiting TTL deletion: ${data.sessions}\nRemembered conversations: ${data.remembered_conversations}\n\nSessions expire from storage after ${data.retention.session_storage_days} day(s); profile, card, and contacts remain until deleted.`,
      );
    });
  }
  function confirmAccountDeletion() {
    Alert.alert(
      "Delete all account data?",
      "This removes your profile, public card, contacts, conversation sessions, remembered notes, stored summaries, and Firebase sign-in account where configured. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: () => void run("Deleting your account data", async () => {
            await identityFetch("/account/me", { method: "DELETE" });
            await clearActiveSession();
            if (firebaseConfigured) await signOutUser();
            setProfile(EMPTY_PROFILE);
            setCard(EMPTY_CARD);
            setContacts([]);
            setSession(null);
            setEnded(null);
          }),
        },
      ],
    );
  }
  async function loadExchange() {
    try {
      const [cardResponse, contactsResponse] = await Promise.all([
        identityFetch("/card/me"), identityFetch(`/contacts?q=${encodeURIComponent(contactSearch)}`),
      ]);
      setCard(await cardResponse.json());
      setContacts(await contactsResponse.json());
    } catch (e: any) {
      setError(e.message || "Could not load cards and contacts.");
    }
  }
  async function loadContacts() {
    try {
      const response = await identityFetch(`/contacts?q=${encodeURIComponent(contactSearch)}`);
      setContacts(await response.json());
    } catch (e: any) {
      setError(e.message || "Could not search contacts.");
    }
  }
  async function saveCard(next = card) {
    await run("Saving your public card", async () => {
      const response = await identityFetch("/card/me", {
        method: "PUT",
        body: JSON.stringify({
          ...Object.fromEntries(CARD_FIELDS.map(({ key }) => [key, next[key]])),
          published: next.published,
          visibility: next.visibility,
        }),
      });
      setCard(await response.json());
    });
  }
  async function rotateCard() {
    await run("Rotating your card link", async () => {
      const response = await identityFetch("/card/me/rotate", { method: "POST" });
      setCard(await response.json());
    });
  }
  async function revokeCard() {
    await run("Revoking your public card", async () => {
      await identityFetch("/card/me", { method: "DELETE" });
      const response = await identityFetch("/card/me");
      setCard(await response.json());
    });
  }
  async function openShareModal() {
    setShowShareModal(true);
    let activeCard = card;
    if (!activeCard.slug || !activeCard.public_url) {
      try {
        const response = await identityFetch("/card/me");
        if (response.ok) {
          activeCard = await response.json();
          setCard(activeCard);
        }
      } catch {
        // fallback
      }
    }
    if (!activeCard.published && activeCard.public_url) {
      const updated = {
        ...activeCard,
        published: true,
        display_name: activeCard.display_name || profile.display_name || "Wings User",
        headline: activeCard.headline || profile.headline || "",
        organization: activeCard.organization || profile.organization || "",
      };
      setCard(updated);
      void saveCard(updated);
    }
  }
  async function beginScan() {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission.granted) {
      setError("Camera permission is required to scan a QR code. You can still open or paste a shared link.");
      return;
    }
    setScannedCard(null);
    setScanLocked(false);
    setScanning(true);
  }
  async function inspectSharedUrl(value: string) {
    if (scanLocked) return;
    setScanLocked(true);
    try {
      const shared = new URL(value);
      const expected = new URL(API);
      const match = shared.pathname.match(/^\/c\/([A-Za-z0-9_-]{20,64})$/);
      if (shared.origin !== expected.origin || !match) throw new Error("This QR code is not a valid Wings card link.");
      const response = await fetch(`${shared.origin}${shared.pathname}/data`);
      if (!response.ok) throw new Error("This card is unavailable or has been revoked.");
      setScannedCard(await response.json());
      setScanning(false);
    } catch (e: any) {
      setError(e.message || "Could not read this card.");
      setScanning(false);
    }
  }
  async function saveScannedContact() {
    if (!scannedCard) return;
    await run("Saving this contact", async () => {
      const response = await identityFetch("/contacts", {
        method: "POST", body: JSON.stringify({ source: "qr", snapshot: scannedCard, user_notes: "" }),
      });
      const saved = await response.json();
      setContacts((items) => [saved, ...items]);
      setScannedCard(null);
    });
  }
  async function updateContact(item: SavedContact) {
    await run("Saving contact notes", async () => {
      const response = await identityFetch(`/contacts/${item.id}`, {
        method: "PUT", body: JSON.stringify({ user_notes: item.user_notes }),
      });
      const saved = await response.json();
      setContacts((items) => items.map((current) => current.id === saved.id ? saved : current));
    });
  }
  async function removeContact(id: string) {
    await run("Deleting contact", async () => {
      await identityFetch(`/contacts/${id}`, { method: "DELETE" });
      setContacts((items) => items.filter((item) => item.id !== id));
    });
  }
  async function linkContactNote(item: SavedContact) {
    if (!ended?.summary) return;
    await run("Linking your selected conversation note", async () => {
      const response = await identityFetch(`/contacts/${item.id}/conversation-note`, {
        method: "POST", body: JSON.stringify({ note: ended.summary }),
      });
      const saved = await response.json();
      setContacts((items) => items.map((current) => current.id === saved.id ? saved : current));
    });
  }
  async function exportContacts() {
    await run("Preparing vCards", async () => {
      const response = await identityFetch("/contacts.vcf");
      const text = await response.text();
      if (Platform.OS === "web") {
        const href = URL.createObjectURL(new Blob([text], { type: "text/vcard" }));
        const anchor = document.createElement("a");
        anchor.href = href; anchor.download = "wings-contacts.vcf"; anchor.click(); URL.revokeObjectURL(href);
      } else {
        await Share.share({ title: "Wings contacts", message: text });
      }
    });
  }
  async function loadProfile() {
    try {
      setProfile(await profileApi());
    } catch (e: any) {
      setError(e.message || "Could not load your profile.");
    }
  }
  async function saveProfile() {
    await run("Saving your profile", async () => {
      setProfile(await profileApi(profile, "PUT"));
    });
  }
  async function authenticate(kind: "signin" | "signup") {
    await run(
      kind === "signin" ? "Signing in" : "Creating your account",
      async () => {
        if (password.length < 6)
          throw new Error("Use a password with at least 6 characters.");
        if (kind === "signin") await signIn(email, password);
        else await signUp(email, password);
        setPassword("");
      },
    );
  }
  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message || "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }
  async function start() {
    if (firebaseConfigured && !authUser) {
      setPage("profile");
      setError("Sign in before starting a conversation.");
      return;
    }
    await run("Starting", async () => {
      setNotice("");
      const s = await api(
        "/session/start",
        { name, context, contact, remember, owner },
        "POST",
        null,
        firebaseConfigured,
      );
      setSession(s);
      const ownerId = firebaseConfigured ? authUser?.uid || "" : owner;
      try {
        await saveActiveSession({ ownerId, session: s, startedAtMs: Date.now() });
      } catch {
        setNotice("The session started, but secure restart recovery is unavailable on this device.");
      }
      setEnded(null);
      setSeconds(0);
      setCues([]);
      setTranscript("");
      setRecordingConsent(false);
      setAutoAssist(false);
      setAutomaticExplanation("");
      setDifficulty({
        level: "low",
        confidence: 0,
        explanation:
          "No strong assistance signal right now. This is a rough conversation signal, not a diagnosis.",
        triggered: false,
      });
      difficultyDetector.current.reset(Date.now());
      performanceTracker.current.reset();
      setPerformance(performanceTracker.current.snapshot());
      audio.reset();
    });
  }
  async function add(text: string) {
    if (!session || !text.trim()) return;
    const data = await api(`/session/${session.id}/transcript`, { text });
    difficultyDetector.current.observeTranscript(text, Date.now());
    setTranscript((t) => (t + " " + text).trim().slice(-2000));
    setSignal(data.signal);
    setDraft("");
  }
  async function play(cue: Cue) {
    Speech.stop();
    Speech.speak(cue.text, {
      rate: 0.9,
      onStart: () => setAssistantSpeaking(true),
      onDone: () => setAssistantSpeaking(false),
      onStopped: () => setAssistantSpeaking(false),
      onError: () => setAssistantSpeaking(false),
    });
  }
  async function getCues(automatic = false) {
    if (!session) return;
    if (!automatic) {
      difficultyDetector.current.noteInteraction(Date.now());
      setAutomaticExplanation("");
    }
    await run("Finding a little inspiration", async () => {
      const startedAt = Date.now();
      performanceTracker.current.beginCue();
      try {
        const data = await api(`/session/${session.id}/cue`);
        performanceTracker.current.finishCue(startedAt);
        setCues(data.cues);
        setSignal(data.signal);
        if (voice && data.cues[0]) void play(data.cues[0]);
      } catch (requestError) {
        performanceTracker.current.failCue();
        throw requestError;
      } finally {
        setPerformance(performanceTracker.current.snapshot());
      }
    });
  }
  async function uploadAudioChunk(
    uri: string,
    chunkIndex: number,
    capturedAtMs: number,
  ) {
    if (!session) return;
    performanceTracker.current.beginAudio();
    const form = new FormData();
    form.append("chunk_index", String(chunkIndex));
    form.append("captured_at_ms", String(capturedAtMs));
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      const ext =
        blob.type.includes("mp4") ||
        blob.type.includes("aac") ||
        blob.type.includes("m4a")
          ? "m4a"
          : "webm";
      form.append("file", blob, `chunk.${ext}`);
    } else {
      form.append("file", { uri, name: "chunk.m4a", type: "audio/m4a" } as any);
    }
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(`${API}/session/${session.id}/audio`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.token}` },
          body: form,
        });
      } catch (networkError) {
        if (attempt === 1) {
          performanceTracker.current.failAudio();
          setPerformance(performanceTracker.current.snapshot());
          throw networkError;
        }
        continue;
      }
      if (attempt === 0 && [409, 502, 503, 504].includes(response.status)) {
        continue;
      }
      break;
    }
    if (!response) {
      performanceTracker.current.failAudio();
      setPerformance(performanceTracker.current.snapshot());
      throw new Error("Audio upload failed before receiving a response.");
    }
    if (response.status === 422) {
      performanceTracker.current.ignoreAudio();
      setPerformance(performanceTracker.current.snapshot());
      return;
    }
    if (!response.ok) {
      performanceTracker.current.failAudio();
      setPerformance(performanceTracker.current.snapshot());
      const detail = await response.json().catch(() => ({}));
      throw new Error(
        detail.detail || `Audio upload failed (${response.status})`,
      );
    }
    const result = await response.json();
    performanceTracker.current.finishAudio(capturedAtMs);
    setPerformance(performanceTracker.current.snapshot());
    difficultyDetector.current.observeTranscript(result.text, capturedAtMs);
    setTranscript((t) => (t + " " + result.text).slice(-2000));
    if (result.text && result.text.trim()) {
      if (!cuesRef.current.length && !automaticRequestPending.current) {
        void getCues(true);
      }
    }
    setSignal(result.signal);
  }
  async function mic() {
    if (!session) return;
    difficultyDetector.current.noteInteraction(Date.now());
    if (session.mode === "demo") {
      await run("Adding sample", () => add(SAMPLE));
      return;
    }
    if (!recordingConsent) {
      setError(
        "Confirm that everyone knows the microphone is in use before recording.",
      );
      return;
    }
    if (listening) {
      await run("Pausing microphone", () => audio.pause());
      return;
    }
    Speech.stop();
    await run("Opening microphone", () => audio.start());
  }
  async function end() {
    if (!session) return;
    await run("Wrapping up", async () => {
      await audio.pause(true);
      await audio.flush();
      const data = await api(`/session/${session.id}/end`);
      setEnded(data);
      await clearActiveSession();
      Speech.stop();
      setAssistantSpeaking(false);
      setAutoAssist(false);
      audio.reset();
    });
  }
  const Button = ({
    text,
    onPress,
    outline = false,
    icon,
  }: {
    text: string;
    onPress: () => void;
    outline?: boolean;
    icon?: any;
  }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      disabled={!!busy}
      onPress={onPress}
      style={({ hovered }: any) => [
        s.button,
        outline && s.outline,
        hovered && { opacity: 0.83 },
        !!busy && { opacity: 0.6 },
      ]}
    >
      {icon && (
        <Icon name={icon} color={outline ? C.green : "#fff"} size={17} />
      )}
      <Text style={[s.buttonText, outline && { color: C.green }]}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      {wide && (
        <View style={s.sidebar}>
          <View style={s.brand}>
            <View style={s.brandMark}>
              <Icon name="leaf" color="white" size={21} />
            </View>
            <Text style={s.brandText}>
              co-wingman<Text style={{ color: C.orange }}>.</Text>
            </Text>
          </View>
          <Text style={s.tagline}>A little help. A real connection.</Text>
          <View style={{ height: 50 }} />
          {[
            {
              id: "session",
              icon: "radio-outline",
              label: "Your conversation",
            },
            {
              id: "profile",
              icon: "person-circle-outline",
              label: "Your profile",
            },
            { id: "card", icon: "id-card-outline", label: "Card & contacts" },
            { id: "notes", icon: "albums-outline", label: "Personal notes" },
            {
              id: "about",
              icon: "shield-checkmark-outline",
              label: "Privacy & how it works",
            },
          ].map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: page === item.id }}
              onPress={() => setPage(item.id)}
              style={[s.nav, page === item.id && s.navActive]}
            >
              <Icon
                name={item.icon}
                color={page === item.id ? C.green : C.muted}
              />
              <Text
                style={[
                  s.navText,
                  page === item.id && { color: C.green, fontWeight: "600" },
                ]}
              >
                {item.label}
              </Text>
              {page === item.id && <View style={s.navDot} />}
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <View style={s.sideNote}>
            <Icon name="headset-outline" size={24} />
            <Text style={s.sideNoteTitle}>Just between us.</Text>
            <Text style={s.small}>
              Use headphones to keep your cues in your ear and your conversation
              in the moment.
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => setPage("profile")} style={s.profile}>
            <View style={s.avatar}>
              <Text style={{ color: C.green, fontWeight: "600" }}>
                {profile.display_name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "YO"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>
                {profile.display_name || authUser?.email || "Your space"}
              </Text>
              <Text style={s.tiny}>
                {firebaseConfigured
                  ? authUser
                    ? "Signed in"
                    : "Sign in to continue"
                  : "Local demo profile"}
              </Text>
            </View>
            <Icon name="chevron-forward" size={16} />
          </Pressable>
        </View>
      )}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.main, !wide && { padding: 22 }]}
      >
        <View style={s.topbar}>
          <Text style={s.breadcrumb}>
            YOUR SPACE <Text style={{ color: "#B8C2B8" }}> / </Text>{" "}
            {page === "session"
              ? "LIVE COMPANION"
              : page === "profile"
                ? "PROFILE"
                : page === "card"
                  ? "CARD & CONTACTS"
                : page === "notes"
                  ? "PERSONAL NOTES"
                  : "PRIVACY"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share my QR card"
              style={s.topbarShareBtn}
              onPress={openShareModal}
            >
              <Icon name="qr-code-outline" size={15} color={C.green} />
              <Text style={s.topbarShareText}>My QR</Text>
            </Pressable>
            <View style={s.demoBadge}>
              <View style={s.demoDot} />
              <Text style={s.demoText}>
                {firebaseConfigured
                  ? authUser
                    ? "Authenticated"
                    : "Sign-in required"
                  : session?.mode === "live"
                    ? "Live mode"
                    : "Demo workspace"}
              </Text>
            </View>
          </View>
        </View>
        {!wide && (
          <View style={[s.brand, { marginBottom: 26 }]}>
            <Icon name="leaf" />
            <Text style={s.brandText}>co-wingman.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={page === "session" ? "Open privacy information" : "Back to conversation"}
              onPress={() => setPage(page === "session" ? "about" : "session")}
              style={{ marginLeft: "auto" }}
            >
              <Icon
                name={
                  page === "session"
                    ? "information-circle-outline"
                    : "arrow-back"
                }
              />
            </Pressable>
          </View>
        )}
        {!wide && (
          <View
            style={{
              flexDirection: "row",
              gap: 16,
              marginBottom: 25,
              flexWrap: "wrap",
            }}
          >
            {[
              ["session", "Conversation"],
              ["profile", "Profile"],
              ["card", "Card"],
              ["notes", "Notes"],
              ["about", "Privacy"],
            ].map(([id, label]) => (
              <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: page === id }} key={id} onPress={() => setPage(id)} style={s.mobileNavItem}>
                <Text
                  style={{
                    color: page === id ? C.green : C.muted,
                    fontSize: 12,
                    fontWeight: page === id ? "700" : "400",
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={s.headingRow}>
          <View>
            <Text style={s.eyebrow}>
              {page === "session"
                ? "BE HERE. WE’VE GOT YOUR BACK."
                : page === "profile"
                  ? "YOUR CONTEXT, YOUR CONTROL"
                  : page === "card"
                    ? "SHARE ONLY WHAT YOU CHOOSE"
                  : "THOUGHTFUL BY DESIGN"}
            </Text>
            <Text style={s.heading}>
              {page === "session"
                ? "Good conversations start\nwith a little curiosity."
                : page === "profile"
                  ? "Your story,\nready when you are."
                  : page === "card"
                    ? "Your card,\nyour connections."
                  : page === "notes"
                    ? "A little context,\nfor next time."
                    : "Your conversation.\nYour choice."}
            </Text>
            <Text style={s.subtitle}>
              {page === "session"
                ? "Stay in the moment. Your wingman will find the words when you need them."
                : page === "profile"
                  ? "Keep the professional context you want your wingman to know. You can edit or delete it anytime."
                  : page === "card"
                    ? "Choose every public field, share by QR or link, and keep exchanged contacts in one place."
                  : "Less to keep. More room to connect."}
            </Text>
          </View>
          {wide && (
            <View style={s.art}>
              <View style={s.orbit} />
              <View style={s.artCircle}>
                <Icon name="leaf-outline" size={42} />
              </View>
              <View style={s.artBubble}>
                <Icon name="chatbubble-ellipses-outline" size={22} />
              </View>
              <View style={s.spark}>
                <Icon name="sparkles" size={20} color={C.orange} />
              </View>
            </View>
          )}
        </View>
        {error !== "" && (
          <View accessibilityRole="alert" style={s.error}>
            <Icon name="alert-circle-outline" color="#9B4C3D" />
            <Text style={{ color: "#9B4C3D", flex: 1 }}>{error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" hitSlop={12} onPress={() => setError("")}>
              <Icon name="close" color="#9B4C3D" />
            </Pressable>
          </View>
        )}
        {notice !== "" && (
          <View accessibilityRole="alert" style={s.notice}>
            <Icon name="information-circle-outline" color={C.green} />
            <Text style={{ color: C.green, flex: 1 }}>{notice}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notice" hitSlop={12} onPress={() => setNotice("")}>
              <Icon name="close" color={C.green} />
            </Pressable>
          </View>
        )}
        {page === "card" ? (
          <View style={{ gap: 22 }}>
            {firebaseConfigured && !authUser ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>Sign in to manage your card</Text>
                <Text style={[s.small, { marginVertical: 14 }]}>Cards and contacts are isolated by your verified account.</Text>
                <Button text="Go to sign in" icon="log-in-outline" onPress={() => setPage("profile")} />
              </View>
            ) : (
              <>
                <View style={[s.columns, !wide && { flexDirection: "column" }]}>
                  <View style={[s.card, { flex: 1, gap: 14 }]}>
                    <View style={s.cardHeader}>
                      <View style={s.iconTile}><Icon name="id-card-outline" /></View>
                      <Text style={s.cardTitle}>Public card editor</Text>
                      <View style={{ marginLeft: "auto" }}>
                        <Button text="Share my QR code" icon="qr-code-outline" onPress={openShareModal} />
                      </View>
                    </View>
                    <Text style={s.small}>Your professional profile stays private. Only enabled fields on this separate card appear publicly.</Text>
                    {CARD_FIELDS.map(({ key, label, placeholder }) => (
                      <View key={key} style={s.cardFieldRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.label}>{label.toUpperCase()}</Text>
                          <TextInput
                            value={card[key]}
                            onChangeText={(value) => setCard({ ...card, [key]: value })}
                            placeholder={placeholder}
                            placeholderTextColor={C.muted}
                            multiline={key === "bio"}
                            autoCapitalize={key === "email" || key === "website" ? "none" : "sentences"}
                            style={[s.profileInput, key === "bio" && s.profileMultiline]}
                          />
                        </View>
                        <View style={{ alignItems: "center", gap: 4 }}>
                          <Switch
                            accessibilityLabel={`Share ${label}`}
                            disabled={key === "display_name" && card.published}
                            value={card.visibility[key]}
                            onValueChange={(value) => setCard({ ...card, visibility: { ...card.visibility, [key]: value } })}
                            trackColor={{ false: "#DDE3DA", true: C.green }} thumbColor="#fff"
                          />
                          <Text style={s.tiny}>{card.visibility[key] ? "Public" : "Private"}</Text>
                        </View>
                      </View>
                    ))}
                    <View style={s.toggleRow}>
                      <View style={{ flex: 1 }}><Text style={s.toggleTitle}>Publish card</Text><Text style={s.tiny}>Turning this off immediately hides the public page.</Text></View>
                      <Switch accessibilityLabel="Publish public card" value={card.published} onValueChange={(published) => setCard({ ...card, published })} trackColor={{ false: "#DDE3DA", true: C.green }} thumbColor="#fff" />
                    </View>
                    <View style={s.profileActions}>
                      <Button text="Save card" icon="checkmark-outline" onPress={() => saveCard()} />
                      <Button text="Rotate link" outline icon="refresh-outline" onPress={rotateCard} />
                      <Button text="Revoke card" outline icon="close-circle-outline" onPress={revokeCard} />
                    </View>
                  </View>
                  <View style={[s.card, s.cardPreview]}>
                    <Text style={s.label}>PUBLIC PREVIEW</Text>
                    <View style={s.contactAvatar}><Text style={s.initials}>{card.display_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "YO"}</Text></View>
                    <Text style={s.serif}>{card.visibility.display_name ? card.display_name || "Your name" : ""}</Text>
                    {CARD_FIELDS.filter(({ key }) => key !== "display_name" && card.visibility[key] && card[key]).map(({ key }) => (
                      <Text key={key} style={key === "headline" ? s.cardTitle : s.small}>{card[key]}</Text>
                    ))}
                    {card.public_url ? (
                      <>
                        <View style={s.qrFrame}><QRCode value={card.public_url} size={190} color={C.ink} backgroundColor="#fff" /></View>
                        <View style={[s.statusBadge, { alignSelf: "center", marginBottom: 6 }]}>
                          <Icon name={card.published ? "checkmark-circle" : "alert-circle"} size={14} color={card.published ? "#2E7D32" : C.orange} />
                          <Text style={[s.tiny, { color: card.published ? "#2E7D32" : C.orange, fontWeight: "600" }]}>
                            {card.published ? "Active · Ready to scan" : "Unpublished · Tap below to activate"}
                          </Text>
                        </View>
                        <Text selectable style={[s.tiny, { textAlign: "center" }]}>{card.public_url}</Text>
                        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center", marginVertical: 6 }}>
                          <Button text="Full-screen QR" icon="qr-code-outline" onPress={openShareModal} />
                          {!card.published && (
                            <Button text="Publish & Activate" icon="globe-outline" outline onPress={async () => {
                              const updated = { ...card, published: true };
                              setCard(updated);
                              await saveCard(updated);
                            }} />
                          )}
                        </View>
                        <Button text="Open public card" outline icon="open-outline" onPress={() => void Linking.openURL(card.public_url)} />
                        <Button text="Download my vCard" outline icon="download-outline" onPress={() => void Linking.openURL(card.public_url + ".vcf")} />
                      </>
                    ) : (
                      <View style={{ alignItems: "center", gap: 10, paddingVertical: 14 }}>
                        <Text style={s.small}>Your public card link will activate when saved.</Text>
                        <Button text="Generate & Share QR Code" icon="qr-code-outline" onPress={openShareModal} />
                      </View>
                    )}
                    <View style={s.nfcNote}><Icon name="phone-portrait-outline" /><Text style={[s.small, { flex: 1 }]}>NFC works only with compatible, pre-written NDEF tags and supported devices. Wings does not claim universal phone-to-phone NFC sharing; use this QR, link, or vCard fallback.</Text></View>
                  </View>
                </View>

                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <View style={s.iconTile}><Icon name="qr-code-outline" /></View>
                    <Text style={s.cardTitle}>Exchange a card</Text>
                  </View>
                  <Text style={[s.small, { marginVertical: 14 }]}>Wings validates scanned links and shows the shared fields before anything is saved.</Text>
                  {!scanning && !scannedCard && <Button text="Scan a Wings QR code" icon="scan-outline" onPress={beginScan} />}
                  {scanning && (
                    <View style={s.scanner}>
                      <CameraView
                        style={{ flex: 1 }}
                        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                        onBarcodeScanned={({ data }) => void inspectSharedUrl(data)}
                      />
                      <Pressable accessibilityRole="button" accessibilityLabel="Close QR scanner" style={s.scannerClose} onPress={() => setScanning(false)}><Icon name="close" color="#fff" /></Pressable>
                    </View>
                  )}
                  {scannedCard && (
                    <View style={s.scannedPreview}>
                      <Text style={s.cardTitle}>{scannedCard.display_name}</Text>
                      <Text style={s.small}>{[scannedCard.headline, scannedCard.organization].filter(Boolean).join(" · ")}</Text>
                      <Text style={s.tiny}>Review complete. Save only with your confirmation.</Text>
                      <View style={s.profileActions}>
                        <Button text="Open shared page" outline icon="open-outline" onPress={() => void Linking.openURL(scannedCard.public_url)} />
                        <Button text="Save contact" icon="person-add-outline" onPress={saveScannedContact} />
                        <Button text="Cancel" outline onPress={() => setScannedCard(null)} />
                      </View>
                    </View>
                  )}
                </View>

                <View style={[s.card, { gap: 14 }]}>
                  <View style={s.cardHeader}>
                    <View style={s.iconTile}><Icon name="people-outline" /></View>
                    <Text style={s.cardTitle}>Saved contacts</Text>
                    <View style={{ marginLeft: "auto" }}><Button text="Export vCards" outline icon="download-outline" onPress={exportContacts} /></View>
                  </View>
                  <View style={s.inputRow}>
                    <Icon name="search-outline" />
                    <TextInput value={contactSearch} onChangeText={setContactSearch} onSubmitEditing={() => void loadContacts()} placeholder="Search name, organization, or notes" style={s.transcriptInput} />
                    <Pressable accessibilityRole="button" accessibilityLabel="Search contacts" style={s.send} onPress={() => void loadContacts()}><Icon name="arrow-forward" color="#fff" size={16} /></Pressable>
                  </View>
                  {contacts.length === 0 ? <Text style={s.small}>No exchanged contacts match this search.</Text> : contacts.map((item) => (
                    <View key={item.id} style={s.savedContact}>
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text style={s.cardTitle}>{item.snapshot.display_name || "Unnamed contact"}</Text>
                        <Text style={s.small}>{[item.snapshot.headline, item.snapshot.organization].filter(Boolean).join(" · ")}</Text>
                        <Text style={s.tiny}>Saved from {item.source.toUpperCase()} · {new Date(item.exchanged_at).toLocaleDateString()}</Text>
                        <TextInput multiline value={item.user_notes} onChangeText={(value) => setContacts((items) => items.map((current) => current.id === item.id ? { ...current, user_notes: value } : current))} placeholder="Your private notes" style={[s.profileInput, s.profileMultiline]} />
                        {item.conversation_note ? <Text style={s.footnote}>Linked conversation note: {item.conversation_note}</Text> : null}
                        <View style={s.profileActions}>
                          <Button text="Open card" outline icon="open-outline" onPress={() => void Linking.openURL(item.snapshot.public_url)} />
                          <Button text="Save notes" outline icon="checkmark-outline" onPress={() => updateContact(item)} />
                          {ended?.summary ? <Button text="Attach latest summary" outline icon="link-outline" onPress={() => linkContactNote(item)} /> : null}
                          <Button text="Delete" outline icon="trash-outline" onPress={() => removeContact(item.id)} />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        ) : page === "profile" ? (
          <View style={[s.card, { maxWidth: 760 }]}>
            {firebaseConfigured && !authUser ? (
              <View style={{ gap: 15 }}>
                <View style={s.cardHeader}>
                  <View style={s.iconTile}>
                    <Icon name="lock-closed-outline" />
                  </View>
                  <Text style={s.cardTitle}>Sign in securely</Text>
                </View>
                <Text style={s.small}>
                  Use your Firebase email and password. Your password goes
                  directly to Firebase and is never sent to the Co-Wingman API.
                </Text>
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor={C.muted}
                  style={s.profileInput}
                />
                <TextInput
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password (6+ characters)"
                  placeholderTextColor={C.muted}
                  style={s.profileInput}
                />
                <View style={s.profileActions}>
                  <Button
                    text="Sign in"
                    icon="log-in-outline"
                    onPress={() => authenticate("signin")}
                  />
                  <Button
                    text="Create account"
                    outline
                    icon="person-add-outline"
                    onPress={() => authenticate("signup")}
                  />
                </View>
              </View>
            ) : (
              <View style={{ gap: 17 }}>
                <View style={s.cardHeader}>
                  <View style={s.iconTile}>
                    <Icon name="person-outline" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>Professional profile</Text>
                    <Text style={s.tiny}>
                      {firebaseConfigured
                        ? profile.email || authUser?.email
                        : "Stored locally in demo mode"}
                    </Text>
                  </View>
                  <Button text="My QR Code" icon="qr-code-outline" outline onPress={openShareModal} />
                </View>
                <TextInput
                  value={profile.display_name}
                  onChangeText={(v) =>
                    setProfile({ ...profile, display_name: v })
                  }
                  placeholder="Your name"
                  placeholderTextColor={C.muted}
                  style={s.profileInput}
                />
                <TextInput
                  value={profile.headline}
                  onChangeText={(v) => setProfile({ ...profile, headline: v })}
                  placeholder="Professional headline"
                  placeholderTextColor={C.muted}
                  style={s.profileInput}
                />
                <TextInput
                  value={profile.organization}
                  onChangeText={(v) =>
                    setProfile({ ...profile, organization: v })
                  }
                  placeholder="University or organization"
                  placeholderTextColor={C.muted}
                  style={s.profileInput}
                />
                <View style={{ gap: 8, marginVertical: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={s.label}>TECH SKILLS ({profile.skills.length} SELECTED)</Text>
                    <Text style={s.tiny}>Tap to toggle</Text>
                  </View>
                  <View style={s.chipContainer}>
                    {POPULAR_SKILLS.map((skill) => {
                      const selected = profile.skills.includes(skill);
                      return (
                        <Pressable
                          key={skill}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          accessibilityLabel={`Skill: ${skill}`}
                          onPress={() => {
                            const next = selected
                              ? profile.skills.filter((item) => item !== skill)
                              : [...profile.skills, skill].slice(0, 20);
                            setProfile({ ...profile, skills: next });
                          }}
                          style={[s.chip, selected && s.chipSelected]}
                        >
                          <Icon
                            name={selected ? "checkmark-circle" : "add-circle-outline"}
                            size={14}
                            color={selected ? "#FFFFFF" : C.muted}
                          />
                          <Text style={[s.chipText, selected && s.chipTextSelected]}>
                            {skill}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    value={profile.skills.filter((item) => !POPULAR_SKILLS.includes(item)).join(", ")}
                    onChangeText={(v) => {
                      const custom = v.split(",").map((x) => x.trim()).filter(Boolean);
                      const selectedStandard = profile.skills.filter((item) => POPULAR_SKILLS.includes(item));
                      setProfile({
                        ...profile,
                        skills: [...selectedStandard, ...custom].slice(0, 20),
                      });
                    }}
                    placeholder="Other skills (comma separated)"
                    placeholderTextColor={C.muted}
                    style={s.profileInput}
                  />
                </View>

                <View style={{ gap: 8, marginVertical: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={s.label}>AREAS OF INTEREST ({profile.interests.length} SELECTED)</Text>
                    <Text style={s.tiny}>Tap to toggle</Text>
                  </View>
                  <View style={s.chipContainer}>
                    {POPULAR_INTERESTS.map((interest) => {
                      const selected = profile.interests.includes(interest);
                      return (
                        <Pressable
                          key={interest}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          accessibilityLabel={`Interest: ${interest}`}
                          onPress={() => {
                            const next = selected
                              ? profile.interests.filter((item) => item !== interest)
                              : [...profile.interests, interest].slice(0, 20);
                            setProfile({ ...profile, interests: next });
                          }}
                          style={[s.chip, selected && s.chipSelected]}
                        >
                          <Icon
                            name={selected ? "checkmark-circle" : "add-circle-outline"}
                            size={14}
                            color={selected ? "#FFFFFF" : C.muted}
                          />
                          <Text style={[s.chipText, selected && s.chipTextSelected]}>
                            {interest}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    value={profile.interests.filter((item) => !POPULAR_INTERESTS.includes(item)).join(", ")}
                    onChangeText={(v) => {
                      const custom = v.split(",").map((x) => x.trim()).filter(Boolean);
                      const selectedStandard = profile.interests.filter((item) => POPULAR_INTERESTS.includes(item));
                      setProfile({
                        ...profile,
                        interests: [...selectedStandard, ...custom].slice(0, 20),
                      });
                    }}
                    placeholder="Other interests (comma separated)"
                    placeholderTextColor={C.muted}
                    style={s.profileInput}
                  />
                </View>
                <TextInput
                  multiline
                  value={profile.networking_goals}
                  onChangeText={(v) =>
                    setProfile({ ...profile, networking_goals: v })
                  }
                  placeholder="Networking goals"
                  placeholderTextColor={C.muted}
                  style={[s.profileInput, s.profileMultiline]}
                />
                <TextInput
                  multiline
                  value={profile.accomplishments}
                  onChangeText={(v) =>
                    setProfile({ ...profile, accomplishments: v })
                  }
                  placeholder="Accomplishments you may want help introducing"
                  placeholderTextColor={C.muted}
                  style={[s.profileInput, s.profileMultiline]}
                />
                <TextInput
                  autoCapitalize="none"
                  keyboardType="url"
                  value={profile.portfolio_url}
                  onChangeText={(v) =>
                    setProfile({ ...profile, portfolio_url: v })
                  }
                  placeholder="Portfolio URL (https://…)"
                  placeholderTextColor={C.muted}
                  style={s.profileInput}
                />
                <TextInput
                  multiline
                  value={profile.resume_summary}
                  onChangeText={(v) =>
                    setProfile({ ...profile, resume_summary: v })
                  }
                  placeholder="Résumé summary (not the full file)"
                  placeholderTextColor={C.muted}
                  style={[s.profileInput, s.profileMultiline]}
                />
                <Text style={s.footnote}>
                  Profile information is stored by your authenticated user ID in
                  Firebase mode. Selected bounded fields can support cues, while
                  your public card is edited separately under Card & contacts.
                </Text>
                <View style={s.profileActions}>
                  <Button
                    text="Save profile"
                    icon="checkmark-outline"
                    onPress={saveProfile}
                  />
                  {firebaseConfigured && (
                    <Button
                      text="Sign out"
                      outline
                      icon="log-out-outline"
                      onPress={() =>
                        run("Signing out", async () => {
                          await signOutUser();
                          await clearActiveSession();
                          setProfile(EMPTY_PROFILE);
                          setSession(null);
                          setEnded(null);
                        })
                      }
                    />
                  )}
                  <Button
                    text="Delete profile data"
                    outline
                    icon="trash-outline"
                    onPress={() =>
                      run("Deleting your profile", async () => {
                        await profileApi(undefined, "DELETE");
                        setProfile(EMPTY_PROFILE);
                      })
                    }
                  />
                  <Button
                    text="Review stored data"
                    outline
                    icon="shield-checkmark-outline"
                    onPress={showPrivacyInventory}
                  />
                  <Button
                    text="Delete all account data"
                    outline
                    icon="warning-outline"
                    onPress={confirmAccountDeletion}
                  />
                </View>
              </View>
            )}
          </View>
        ) : page === "about" ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>A friend in your ear.</Text>
            <Text style={s.body}>
              Co-Wingman offers questions and gentle suggestions based on what’s
              being said. It’s an assist, never a script.
            </Text>
            {[
              [
                "mic-outline",
                "Audio travels to the cloud",
                "In live mode, microphone chunks are sent to Google Cloud Speech-to-Text. The backend does not save raw audio.",
              ],
              [
                "layers-outline",
                "Only a small window",
                "Recent transcript fragments are folded into bounded topic summaries. Providers receive limited context.",
              ],
              [
                "book-outline",
                "Your own personal notes",
                "Opt in to keep summary notes between conversations. Delete them during an active session. They are never shared with the contact.",
              ],
              [
                "pulse-outline",
                "A rough speech-pattern signal",
                "Pause and hesitation cues guide timing. This is not a diagnostic or anxiety measurement.",
              ],
              [
                "flask-outline",
                "A transparent demo",
                "Demo cues are preset and selected by topic. Device voice is used instead of Gemini TTS. No cloud AI is called in demo mode.",
              ],
            ].map(([icon, title, body]) => (
              <View key={title} style={s.infoRow}>
                <Icon name={icon} />
                <View style={{ flex: 1 }}>
                  <Text style={s.infoTitle}>{title}</Text>
                  <Text style={s.small}>{body}</Text>
                </View>
              </View>
            ))}
            <View style={s.diagnostics} accessible accessibilityLabel="Current session performance diagnostics">
              <Text style={s.infoTitle}>Session diagnostics</Text>
              <Text style={s.small}>
                Transcript p95: {performance.transcriptP95Ms === null ? "not measured" : `${performance.transcriptP95Ms} ms`} (target ≤ {PERFORMANCE_TARGETS.transcriptP95Ms} ms){"\n"}
                Cue p95: {performance.cueP95Ms === null ? "not measured" : `${performance.cueP95Ms} ms`} (target ≤ {PERFORMANCE_TARGETS.cueP95Ms} ms){"\n"}
                Transcription loss: {(performance.transcriptionLossRate * 100).toFixed(1)}% (target ≤ {PERFORMANCE_TARGETS.transcriptionLossRate * 100}%){"\n"}
                Provider errors: {(performance.providerErrorRate * 100).toFixed(1)}% (target ≤ {PERFORMANCE_TARGETS.providerErrorRate * 100}%)
              </Text>
              <Text style={s.footnote}>Measurements stay in memory for the current session and are not sent as speech-feature telemetry.</Text>
            </View>
            <Button
              text="Back to your conversation"
              onPress={() => setPage("session")}
            />
          </View>
        ) : page === "notes" ? (
          <View style={s.card}>
            <Icon name="albums-outline" size={34} />
            <Text style={[s.cardTitle, { marginTop: 20 }]}>
              Personal, by choice.
            </Text>
            <Text style={s.body}>
              {session?.memory ||
                "Start a conversation with “Remember topic notes” enabled to load notes for that person. Notes are brief topic summaries, never full transcripts."}
            </Text>
            {session && !ended && (
              <Button
                text="Delete this contact’s notes"
                outline
                icon="trash-outline"
                onPress={() =>
                  run("Deleting notes", async () => {
                    await api(
                      `/session/${session.id}/memory`,
                      undefined,
                      "DELETE",
                    );
                    setSession({ ...session, memory: "" });
                    setRemember(false);
                  })
                }
              />
            )}
            <Text style={[s.small, { marginTop: 18 }]}>
              Deleting also turns off saving for the current conversation.
            </Text>
          </View>
        ) : (
          <>
            <View style={[s.columns, !wide && { flexDirection: "column" }]}>
              <View style={{ flex: 1.58, gap: 22 }}>
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <View style={s.iconTile}>
                      <Icon name="people-outline" />
                    </View>
                    <Text style={s.cardTitle}>
                      The person, not just the profile
                    </Text>
                    <Text style={s.step}>01</Text>
                  </View>
                  <Text style={s.small}>
                    A little background helps. The conversation always comes
                    first.
                  </Text>
                  <View style={[s.contactRow, { marginTop: 24 }]}>
                    <View style={s.contactAvatar}>
                      <Text style={s.initials}>
                        {name
                          .split(" ")
                          .map((x) => x[0])
                          .join("")
                          .slice(0, 2) || "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>WHO ARE YOU TALKING TO?</Text>
                      <TextInput
                        accessibilityLabel="Conversation partner name"
                        editable={!session || !!ended}
                        value={name}
                        onChangeText={setName}
                        placeholder="Their name"
                        style={s.nameInput}
                      />
                    </View>
                    <Icon name="pencil-outline" size={17} color={C.muted} />
                  </View>
                  <TextInput
                    accessibilityLabel="Conversation context"
                    editable={!session || !!ended}
                    value={context}
                    onChangeText={setContext}
                    placeholder="How you know them, what brings you together…"
                    style={s.contextInput}
                  />
                  <View style={s.divider} />
                  <View style={s.contextOptions}>
                    <Icon name="link-outline" size={17} />
                    <TextInput
                      accessibilityLabel="Private contact label"
                      editable={!session || !!ended}
                      value={contact}
                      onChangeText={setContact}
                      placeholder="LinkedIn URL or a contact label (optional)"
                      placeholderTextColor={C.muted}
                      style={{
                        flex: 1,
                        color: C.ink,
                        fontSize: 12,
                        padding: 4,
                      }}
                    />
                  </View>
                  <Text style={s.footnote}>
                    Used only as a private contact label. Wings never scrapes the
                    linked service.
                  </Text>
                  <View style={s.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.toggleTitle}>Remember topic notes</Text>
                      <Text style={s.tiny}>
                        Your personal notes, only if you choose.
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel="Remember topic notes"
                      disabled={!!session && !ended}
                      value={remember}
                      onValueChange={setRemember}
                      trackColor={{ false: "#DDE3DA", true: C.green }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <View style={s.iconTile}>
                      <Icon name="radio-outline" />
                    </View>
                    <Text style={s.cardTitle}>In the conversation</Text>
                    <View
                      style={{
                        marginLeft: "auto",
                        flexDirection: "row",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={[
                          s.demoDot,
                          {
                            backgroundColor:
                              session && !ended ? "#749571" : "#B8C2B8",
                          },
                        ]}
                      />
                      <Text style={s.tiny}>
                        {ended
                          ? "Complete"
                          : session
                            ? "In session"
                            : "Ready when you are"}
                      </Text>
                    </View>
                  </View>
                  {ended ? (
                    <View style={{ gap: 18, paddingTop: 24 }}>
                      <Text style={s.serif}>A connection worth keeping.</Text>
                      <Text style={s.body}>{ended.summary}</Text>
                      {!!ended.follow_up && (
                        <View style={s.transcriptBox}>
                          <Text style={s.label}>OPTIONAL FOLLOW-UP DRAFT</Text>
                          <Text style={s.transcript}>{ended.follow_up}</Text>
                        </View>
                      )}
                      <Text style={s.small}>
                        {ended.saved
                          ? "Topic notes saved for next time."
                          : "No contact notes saved."}{" "}
                        Raw session fragments have been cleared.
                      </Text>
                      <Button
                        text="Start another conversation"
                        onPress={() => {
                          setSession(null);
                          setEnded(null);
                          setTranscript("");
                          setCues([]);
                        }}
                      />
                    </View>
                  ) : !session ? (
                    <View style={s.startArea}>
                      <View style={s.wave}>
                        {[14, 24, 38, 20, 48, 32, 56, 35, 46, 22, 32, 16].map(
                          (h, i) => (
                            <View
                              key={i}
                              style={{
                                width: 4,
                                height: h,
                                backgroundColor:
                                  i % 3 === 0 ? "#80A184" : "#C1D2BF",
                                borderRadius: 4,
                              }}
                            />
                          ),
                        )}
                      </View>
                      <Text style={s.serif}>
                        Less overthinking. More connecting.
                      </Text>
                      <Text
                        style={[
                          s.small,
                          {
                            textAlign: "center",
                            maxWidth: 330,
                            marginBottom: 22,
                          },
                        ]}
                      >
                        Start your session, take a breath, and let the
                        conversation unfold.
                      </Text>
                      <Button
                        text="Start a conversation"
                        icon="arrow-forward"
                        onPress={start}
                      />
                      <Text
                        style={[
                          s.footnote,
                          { textAlign: "center", marginTop: 15 },
                        ]}
                      >
                        Demo mode · No microphone or cloud AI required
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={s.liveBar}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            session.mode === "demo"
                              ? "Add sample transcript"
                              : listening
                                ? "Stop recording"
                                : "Start recording"
                          }
                          onPress={mic}
                          style={[
                            s.micButton,
                            listening && { backgroundColor: "#A75E47" },
                          ]}
                        >
                          <Icon
                            name={listening ? "stop" : "mic-outline"}
                            color="#fff"
                          />
                        </Pressable>
                        <View style={{ flex: 1 }}>
                          <Text style={s.toggleTitle}>
                            {listening
                              ? `Recording in ${AUDIO_CHUNK_SECONDS}-second chunks`
                              : session.mode === "demo"
                                ? "Try a sample conversation"
                                : audio.phase === "paused"
                                  ? "Microphone paused"
                                  : "Ready to listen"}
                          </Text>
                          <Text style={s.tiny}>
                            {session.mode === "demo"
                              ? "The mic button adds a sample transcript."
                              : audio.pendingChunks
                                ? `${audio.pendingChunks} chunk${audio.pendingChunks === 1 ? "" : "s"} waiting for transcription.`
                                : "Tap to record or pause. Recent speech appears incrementally."}
                          </Text>
                        </View>
                        {listening && (
                          <View style={s.recordingBadge}>
                            <View style={s.recordingDot} />
                            <Text style={s.recordingBadgeText}>RECORDING</Text>
                          </View>
                        )}
                        <Text style={s.timer}>
                          {Math.floor(seconds / 60)
                            .toString()
                            .padStart(2, "0")}
                          :{(seconds % 60).toString().padStart(2, "0")}
                        </Text>
                      </View>
                      {session.mode !== "demo" && (
                        <>
                          <View style={s.consentRow}>
                            <Icon name="people-outline" size={18} />
                            <View style={{ flex: 1 }}>
                              <Text style={s.toggleTitle}>
                                Everyone knows the microphone is in use
                              </Text>
                              <Text style={s.tiny}>
                                Required before recording. The indicator stays
                                visible while capture is active.
                              </Text>
                            </View>
                            <Switch
                              accessibilityLabel="Recording consent confirmed"
                              value={recordingConsent}
                              onValueChange={(value) => {
                                setRecordingConsent(value);
                                if (!value) setAutoAssist(false);
                              }}
                              disabled={listening}
                              trackColor={{ false: "#DDE3DA", true: C.green }}
                              thumbColor="#fff"
                            />
                          </View>
                          <View style={s.consentRow}>
                            <Icon name="sparkles-outline" size={18} />
                            <View style={{ flex: 1 }}>
                              <Text style={s.toggleTitle}>
                                Automatic gentle suggestions
                              </Text>
                              <Text style={s.tiny}>
                                Optional. Uses local pause, microphone-level, and
                                transcript patterns. It does not measure anxiety.
                              </Text>
                            </View>
                            <Switch
                              accessibilityLabel="Automatic gentle suggestions"
                              value={autoAssist}
                              onValueChange={(value) => {
                                difficultyDetector.current.noteInteraction(Date.now());
                                setAutoAssist(value);
                                setAutomaticExplanation("");
                              }}
                              disabled={!recordingConsent && !autoAssist}
                              trackColor={{ false: "#DDE3DA", true: C.green }}
                              thumbColor="#fff"
                            />
                          </View>
                        </>
                      )}
                      <View style={s.transcriptBox}>
                        <Text style={s.label}>THE RECENT CONVERSATION</Text>
                        <Text style={s.transcript}>
                          {transcript ||
                            "Your conversation will appear here. Add a sample or type a few words below."}
                        </Text>
                      </View>
                      <View style={s.inputRow}>
                        <TextInput
                          accessibilityLabel="Recent conversation text"
                          multiline
                          placeholder="Or add what they just said…"
                          placeholderTextColor={C.muted}
                          value={draft}
                          onChangeText={setDraft}
                          style={s.transcriptInput}
                        />
                        <Pressable
                          disabled={!!busy || !draft.trim()}
                          onPress={() =>
                            run("Adding context", () => add(draft))
                          }
                          accessibilityLabel="Add transcript"
                          style={s.send}
                        >
                          <Icon name="arrow-up" color="#fff" size={18} />
                        </Pressable>
                      </View>
                      <View style={s.sessionActions}>
                        <Button
                          text="Get me unstuck"
                          icon="sparkles-outline"
                          onPress={() => void getCues(false)}
                        />
                        <Pressable accessibilityRole="button" accessibilityLabel="End conversation" disabled={!!busy} onPress={end} style={s.endButton}>
                          <Text style={s.endText}>End conversation</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              </View>
              <View style={{ flex: 1, gap: 22 }}>
                <View style={[s.card, s.cuePanel]}>
                  <View style={s.cardHeader}>
                    <Icon name="sparkles-outline" size={21} />
                    <Text style={s.cardTitle}>A little inspiration</Text>
                    <Text style={s.step}>02</Text>
                  </View>
                  <Text style={[s.small, { marginTop: 10 }]}>
                    A nudge, not a script. Make it your own.
                  </Text>
                  {!!automaticExplanation && (
                    <View accessibilityRole="alert" style={s.autoExplanation}>
                      <Icon name="information-circle-outline" size={18} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.toggleTitle}>Why this appeared</Text>
                        <Text style={s.tiny}>{automaticExplanation}</Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss automatic suggestion explanation" hitSlop={12} onPress={() => setAutomaticExplanation("")}>
                        <Icon name="close" size={17} color={C.muted} />
                      </Pressable>
                    </View>
                  )}
                  <View style={s.cueList}>
                    {cues.length ? (
                      cues.map((cue, i) => (
                        <Pressable
                          key={cue.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${cue.category} cue: ${cue.text}`}
                          accessibilityHint="Speaks this cue aloud when voice output is enabled"
                          onPress={() => void play(cue)}
                          style={[
                            s.cueCard,
                            cue.category === "suggestion" && s.suggestion,
                          ]}
                        >
                          <View style={s.cueMeta}>
                            <View
                              style={[
                                s.category,
                                cue.category === "suggestion" && {
                                  backgroundColor: "#F2EBDD",
                                },
                              ]}
                            >
                              <Icon
                                name={
                                  cue.category === "question"
                                    ? "chatbubble-outline"
                                    : "bulb-outline"
                                }
                                size={12}
                                color={
                                  cue.category === "question"
                                    ? C.green
                                    : C.orange
                                }
                              />
                              <Text
                                style={[
                                  s.categoryText,
                                  cue.category === "suggestion" && {
                                    color: C.orange,
                                  },
                                ]}
                              >
                                {cue.category === "question"
                                  ? "A QUESTION TO ASK"
                                  : cue.category === "transition"
                                    ? "A NATURAL TRANSITION"
                                    : cue.category === "experience"
                                      ? "AN EXPERIENCE TO SHARE"
                                      : "A TALKING POINT"}
                              </Text>
                            </View>
                            <Icon
                              name="volume-medium-outline"
                              size={17}
                              color={C.muted}
                            />
                          </View>
                          <Text style={s.cueText}>{cue.text}</Text>
                          {i === 0 && (
                            <Text style={s.cueFooter}>
                              A good place to start ↗
                            </Text>
                          )}
                        </Pressable>
                      ))
                    ) : (
                      <View style={s.emptyCues}>
                        <View style={s.emptyIcon}>
                          <Icon
                            name="chatbubbles-outline"
                            size={31}
                            color="#81977E"
                          />
                        </View>
                        <Text style={s.emptyTitle}>
                          The right words, at the right time.
                        </Text>
                        <Text style={[s.small, { textAlign: "center" }]}>
                          Once the conversation gets going, a few thoughtful
                          ideas will find their way here.
                        </Text>
                        <View style={s.fakeCard}>
                          <View style={s.fakeLine} />
                          <View
                            style={[
                              s.fakeLine,
                              { width: "65%", backgroundColor: "#E7EBE1" },
                            ]}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                  <View style={s.voiceRow}>
                    <Icon name="headset-outline" size={19} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.toggleTitle}>Whisper cues to me</Text>
                      <Text style={s.tiny}>Best with headphones</Text>
                    </View>
                    <Switch
                      accessibilityLabel="Speak suggestions aloud"
                      value={voice}
                      onValueChange={(v) => {
                        setVoice(v);
                        if (!v) {
                          Speech.stop();
                          setAssistantSpeaking(false);
                        }
                      }}
                      trackColor={{ false: "#DDE3DA", true: C.green }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>
                <View style={s.gentleCard}>
                  <Icon name="sunny-outline" color={C.orange} size={25} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.gentleTitle}>
                      {difficulty.level === "high"
                        ? "There’s no rush."
                        : "You don’t have to be interesting."}
                    </Text>
                    <Text style={s.small}>
                      {difficulty.level === "high"
                        ? "Take a breath. A short, simple question is enough."
                        : "Just be interested. A good question can open a whole new door."}
                    </Text>
                    {session && (
                      <Text style={[s.footnote, { marginTop: 10 }]}>
                        Local assistance signal: {difficulty.level}
                        {autoAssist
                          ? ` · confidence ${Math.round(difficulty.confidence * 100)}%`
                          : " · automatic help off"}
                        {" · Not a diagnosis"}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
            <View style={s.bottomNote}>
              <Icon name="lock-closed-outline" size={13} color={C.muted} />
              <Text style={s.tiny}>
                Made for connection. Built with care. Your conversations are
                never used as a script.
              </Text>
            </View>
          </>
        )}
        {!!busy && (
          <View style={s.loading}>
            <ActivityIndicator color={C.green} />
            <Text style={s.small}>{busy}…</Text>
          </View>
        )}
        <View style={s.footer}>
          <Text style={s.tiny}>CO-WINGMAN</Text>
          <Text style={s.tiny}>
            A friend in your ear. Space to be yourself.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showShareModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShareModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>Share Your Digital Card</Text>
                <Text style={s.tiny}>Let someone scan this code to exchange contacts</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close share modal"
                style={s.modalClose}
                onPress={() => setShowShareModal(false)}
              >
                <Icon name="close" color={C.ink} size={20} />
              </Pressable>
            </View>

            <View style={s.modalQrCard}>
              <View style={s.modalAvatar}>
                <Text style={s.initials}>
                  {(card.display_name || profile.display_name || "ME")
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </Text>
              </View>
              <Text style={s.modalCardName}>
                {card.display_name || profile.display_name || "Your Name"}
              </Text>
              <Text style={s.modalCardHeadline}>
                {[card.headline || profile.headline, card.organization || profile.organization]
                  .filter(Boolean)
                  .join(" · ") || "Co-Wingman Member"}
              </Text>

              <View style={s.modalQrFrame}>
                {card.public_url ? (
                  <QRCode
                    value={card.public_url}
                    size={210}
                    color={C.ink}
                    backgroundColor="#FFFFFF"
                  />
                ) : (
                  <ActivityIndicator color={C.green} size="large" />
                )}
              </View>

              <View style={s.statusBadge}>
                <Icon name={card.published ? "checkmark-circle" : "alert-circle"} size={14} color={card.published ? "#2E7D32" : C.orange} />
                <Text style={[s.tiny, { color: card.published ? "#2E7D32" : C.orange, fontWeight: "600" }]}>
                  {card.published ? "Active · Anyone can scan" : "Unpublished · Tap below to activate"}
                </Text>
              </View>

              {card.public_url ? (
                <Text selectable style={[s.tiny, { textAlign: "center", color: C.muted }]} numberOfLines={1}>
                  {card.public_url}
                </Text>
              ) : null}

              <View style={s.modalActions}>
                <Button
                  text="Share link"
                  icon="share-outline"
                  onPress={async () => {
                    if (!card.public_url) return;
                    try {
                      await Share.share({
                        title: `${card.display_name || "My"} Digital Card`,
                        message: `Connect with ${card.display_name || "me"}: ${card.public_url}`,
                        url: card.public_url,
                      });
                    } catch {
                      // fallback
                    }
                  }}
                />
                {!card.published && (
                  <Button
                    text="Publish card"
                    icon="globe-outline"
                    outline
                    onPress={async () => {
                      const updated = { ...card, published: true };
                      setCard(updated);
                      await saveCard(updated);
                    }}
                  />
                )}
                <Button
                  text="Done"
                  outline
                  onPress={() => setShowShareModal(false)}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, flexDirection: "row" },
  sidebar: {
    width: 255,
    backgroundColor: "#FCFCF9",
    borderRightWidth: 1,
    borderColor: C.line,
    padding: 25,
    paddingTop: 34,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: {
    width: 32,
    height: 34,
    borderRadius: 11,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    fontSize: 22,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -0.9,
  },
  tagline: { fontSize: 11, color: C.muted, marginTop: 11, marginLeft: 2 },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 15,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    minHeight: 44,
  },
  navActive: { backgroundColor: "#EAF0E5" },
  navText: { fontSize: 12, color: C.muted, flex: 1 },
  navDot: { width: 5, height: 5, backgroundColor: C.green, borderRadius: 5 },
  sideNote: {
    backgroundColor: "#F1F4EC",
    borderRadius: 12,
    padding: 18,
    gap: 10,
    marginBottom: 26,
  },
  sideNoteTitle: { fontSize: 14, fontWeight: "600", color: C.ink },
  profile: {
    borderTopWidth: 1,
    borderColor: C.line,
    paddingTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 48,
  },
  avatar: {
    width: 34,
    height: 34,
    backgroundColor: "#E6EDDF",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
    marginBottom: 4,
  },
  main: {
    paddingHorizontal: 44,
    paddingTop: 30,
    maxWidth: 1450,
    width: "100%",
    alignSelf: "center",
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 36,
  },
  breadcrumb: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: C.muted,
    fontWeight: "600",
  },
  demoBadge: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "#FCFCF9",
  },
  demoDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: "#92A57E" },
  demoText: { fontSize: 10, color: C.muted },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 35,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 2,
    color: C.green,
    fontWeight: "700",
    marginBottom: 14,
  },
  heading: {
    fontFamily: Platform.OS === "web" ? "Georgia" : "serif",
    fontSize: 38,
    lineHeight: 45,
    color: C.ink,
    letterSpacing: -1.1,
  },
  subtitle: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 21,
    marginTop: 14,
    maxWidth: 460,
  },
  art: {
    width: 160,
    height: 145,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 24,
  },
  orbit: {
    position: "absolute",
    width: 145,
    height: 130,
    borderWidth: 1,
    borderColor: "#DDE4D4",
    borderRadius: 90,
    transform: [{ rotate: "-22deg" }],
  },
  artCircle: {
    height: 94,
    width: 94,
    borderRadius: 48,
    backgroundColor: "#E7EDD9",
    justifyContent: "center",
    alignItems: "center",
  },
  artBubble: {
    position: "absolute",
    right: 0,
    top: 15,
    backgroundColor: "#FBFBF7",
    padding: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
  },
  spark: { position: "absolute", left: 3, bottom: 16 },
  columns: { flexDirection: "row", gap: 24, alignItems: "stretch" },
  card: {
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    padding: 24,
  },
  cardFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderTopWidth: 1,
    borderColor: "#EFF1EA",
    paddingTop: 12,
  },
  cardPreview: {
    flex: 0.72,
    alignItems: "center",
    gap: 12,
    minWidth: 280,
  },
  qrFrame: {
    backgroundColor: "#fff",
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
  },
  nfcNote: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: C.pale,
    padding: 13,
    borderRadius: 9,
    marginTop: 8,
  },
  scanner: {
    height: 340,
    maxWidth: 520,
    width: "100%",
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#111",
  },
  scannerClose: {
    position: "absolute",
    right: 12,
    top: 12,
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  scannedPreview: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 18,
    gap: 9,
  },
  savedContact: {
    borderTopWidth: 1,
    borderColor: C.line,
    paddingTop: 16,
    flexDirection: "row",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconTile: {
    width: 33,
    height: 33,
    borderRadius: 9,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  step: { marginLeft: "auto", fontSize: 10, color: "#A4B09E" },
  small: { fontSize: 12, lineHeight: 20, color: C.muted },
  tiny: { fontSize: 10, lineHeight: 16, color: C.muted },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  contactAvatar: {
    height: 48,
    width: 48,
    borderRadius: 24,
    backgroundColor: "#EEE9DD",
    justifyContent: "center",
    alignItems: "center",
  },
  initials: {
    fontSize: 17,
    fontFamily: Platform.OS === "web" ? "Georgia" : "serif",
    color: "#8B785D",
  },
  label: {
    fontSize: 8,
    letterSpacing: 1.3,
    color: C.muted,
    fontWeight: "600",
    marginBottom: 5,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: "500",
    color: C.ink,
    paddingVertical: 3,
  },
  contextInput: {
    color: C.muted,
    fontSize: 12,
    marginTop: 16,
    paddingVertical: 9,
  },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 15 },
  contextOptions: { flexDirection: "row", gap: 8, alignItems: "center" },
  footnote: { fontSize: 9, color: C.muted, lineHeight: 15, marginTop: 7 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: "#EFF1EA",
  },
  toggleTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: C.ink,
    marginBottom: 3,
  },
  button: {
    backgroundColor: C.green,
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 19,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 44,
  },
  buttonText: { color: "white", fontSize: 12, fontWeight: "600" },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.line,
  },
  startArea: { alignItems: "center", paddingTop: 27, paddingBottom: 8 },
  wave: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 17,
  },
  serif: {
    fontFamily: Platform.OS === "web" ? "Georgia" : "serif",
    fontSize: 22,
    color: C.ink,
    lineHeight: 30,
    marginBottom: 10,
    textAlign: "center",
  },
  cuePanel: { backgroundColor: "#FCFDF9" },
  cueList: { marginTop: 24, gap: 12 },
  emptyCues: {
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 8,
  },
  emptyIcon: {
    width: 67,
    height: 67,
    borderRadius: 36,
    backgroundColor: "#EDF1E5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 21,
  },
  emptyTitle: {
    fontFamily: Platform.OS === "web" ? "Georgia" : "serif",
    fontSize: 18,
    lineHeight: 25,
    color: C.ink,
    textAlign: "center",
    marginBottom: 10,
  },
  fakeCard: {
    width: "95%",
    padding: 17,
    borderWidth: 1,
    borderColor: "#E9EDE3",
    borderRadius: 8,
    marginTop: 25,
    gap: 9,
    transform: [{ rotate: "-3deg" }],
  },
  fakeLine: {
    height: 6,
    width: "85%",
    backgroundColor: "#DEE6D5",
    borderRadius: 3,
  },
  voiceRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: C.line,
    marginTop: 24,
  },
  gentleCard: {
    backgroundColor: "#F2EFE5",
    padding: 21,
    borderRadius: 12,
    flexDirection: "row",
    gap: 13,
  },
  gentleTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
    marginBottom: 6,
    lineHeight: 20,
  },
  bottomNote: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    marginTop: 28,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 25,
    marginTop: 22,
    borderTopWidth: 1,
    borderColor: C.line,
  },
  error: {
    backgroundColor: "#F9EDE7",
    borderRadius: 9,
    padding: 15,
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  notice: {
    backgroundColor: "#EEF3E8",
    borderRadius: 9,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  mobileNavItem: { minHeight: 44, justifyContent: "center" },
  liveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 23,
  },
  micButton: {
    backgroundColor: C.green,
    width: 44,
    height: 44,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F9EDE7",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
  },
  recordingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#A75E47",
  },
  recordingBadgeText: {
    color: "#8A4938",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.pale,
    borderRadius: 9,
    padding: 13,
    marginBottom: 15,
  },
  autoExplanation: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#EEF3E8",
    borderRadius: 9,
    padding: 13,
    marginTop: 15,
  },
  timer: { fontSize: 13, color: C.muted, fontVariant: ["tabular-nums"] },
  transcriptBox: { backgroundColor: "#F5F7F1", padding: 17, borderRadius: 8 },
  transcript: { fontSize: 14, lineHeight: 24, color: C.ink, marginTop: 6 },
  inputRow: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    padding: 9,
    marginTop: 13,
    gap: 8,
  },
  transcriptInput: {
    flex: 1,
    color: C.ink,
    fontSize: 12,
    minHeight: 34,
    padding: 4,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionActions: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  endText: { fontSize: 11, color: C.muted, paddingVertical: 10 },
  endButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  cueCard: {
    borderWidth: 1,
    borderColor: "#DDE5D5",
    backgroundColor: "#F2F6ED",
    borderRadius: 10,
    padding: 17,
  },
  suggestion: { backgroundColor: "#FAF7F0", borderColor: "#EBE4D7" },
  cueMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 5,
  },
  category: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: "#E4EDDD",
  },
  categoryText: {
    fontSize: 7,
    fontWeight: "700",
    color: C.green,
    letterSpacing: 0.8,
  },
  cueText: {
    fontFamily: Platform.OS === "web" ? "Georgia" : "serif",
    fontSize: 19,
    color: C.ink,
    lineHeight: 28,
    marginTop: 14,
  },
  cueFooter: { fontSize: 9, color: "#849579", marginTop: 17 },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
    marginTop: 14,
  },
  profileInput: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    backgroundColor: "#FCFCF9",
    color: C.ink,
    fontSize: 13,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  profileMultiline: { minHeight: 78, textAlignVertical: "top" },
  profileActions: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 4,
  },
  body: { fontSize: 14, color: C.muted, lineHeight: 25, marginVertical: 16 },
  infoRow: { flexDirection: "row", gap: 15, marginBottom: 24 },
  infoTitle: { fontSize: 15, color: C.ink, marginBottom: 7, fontWeight: "600" },
  diagnostics: { backgroundColor: C.pale, borderRadius: 10, padding: 16, marginBottom: 20 },
  topbarShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#EBF1E6",
    borderWidth: 1,
    borderColor: "#D2DFC9",
  },
  topbarShareText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.green,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#FCFCF9",
    borderWidth: 1,
    borderColor: C.line,
  },
  chipSelected: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
    color: C.ink,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    maxWidth: 420,
    width: "100%",
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.ink,
  },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F0F3EC",
    alignItems: "center",
    justifyContent: "center",
  },
  modalQrCard: {
    alignItems: "center",
    gap: 8,
  },
  modalAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#E6EDDF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  modalCardName: {
    fontSize: 18,
    fontWeight: "700",
    color: C.ink,
    textAlign: "center",
  },
  modalCardHeadline: {
    fontSize: 13,
    color: C.muted,
    textAlign: "center",
    maxWidth: 320,
  },
  modalQrFrame: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    marginVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
    minWidth: 220,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#F2F5EF",
    borderRadius: 12,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    width: "100%",
    justifyContent: "center",
    flexWrap: "wrap",
  },
});
