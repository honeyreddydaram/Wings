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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
const AUDIO_CHUNK_SECONDS = Math.min(
  10,
  Math.max(2, Number(process.env.EXPO_PUBLIC_AUDIO_CHUNK_SECONDS) || 4),
);
const C = {
  bg: "#F7F8F4",
  ink: "#203D32",
  muted: "#7D8A80",
  green: "#34654E",
  pale: "#EDF2EA",
  line: "#E1E6DD",
  white: "#FFFFFF",
  orange: "#B78043",
};
const SAMPLE =
  "I’ve been working on a product design project with a small team. We just finished our first round of user research, and some of the feedback really surprised me.";
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
  const [name, setName] = useState("Alex Morgan");
  const [context, setContext] = useState(
    "Product designer · First coffee together",
  );
  const [contact, setContact] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [voice, setVoice] = useState(true);
  const [remember, setRemember] = useState(false);
  const [signal, setSignal] = useState("low");
  const [ended, setEnded] = useState<{
    summary: string;
    follow_up?: string;
    saved: boolean;
  } | null>(null);
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [autoAssist, setAutoAssist] = useState(false);
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
  const difficultyDetector = useRef(new DifficultyDetector());
  const autoAssistRef = useRef(false);
  const assistantSpeakingRef = useRef(false);
  const busyRef = useRef(false);
  const automaticRequestPending = useRef(false);
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
    if (!session || ended) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [session, ended]);
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
      const s = await api(
        "/session/start",
        { name, context, contact, remember, owner },
        "POST",
        null,
        firebaseConfigured,
      );
      setSession(s);
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
      const data = await api(`/session/${session.id}/cue`);
      setCues(data.cues);
      setSignal(data.signal);
      if (voice && data.cues[0]) void play(data.cues[0]);
    });
  }
  async function uploadAudioChunk(
    uri: string,
    chunkIndex: number,
    capturedAtMs: number,
  ) {
    if (!session) return;
    const form = new FormData();
    form.append("chunk_index", String(chunkIndex));
    form.append("captured_at_ms", String(capturedAtMs));
    if (Platform.OS === "web") {
      form.append("file", await (await fetch(uri)).blob(), "chunk.webm");
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
        if (attempt === 1) throw networkError;
        continue;
      }
      if (attempt === 0 && [409, 502, 503, 504].includes(response.status)) {
        continue;
      }
      break;
    }
    if (!response)
      throw new Error("Audio upload failed before receiving a response.");
    if (response.status === 422) return;
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(
        detail.detail || `Audio upload failed (${response.status})`,
      );
    }
    const result = await response.json();
    difficultyDetector.current.observeTranscript(result.text, capturedAtMs);
    setTranscript((t) => (t + " " + result.text).slice(-2000));
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
            { id: "notes", icon: "albums-outline", label: "Personal notes" },
            {
              id: "about",
              icon: "shield-checkmark-outline",
              label: "Privacy & how it works",
            },
          ].map((item) => (
            <Pressable
              key={item.id}
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
          <Pressable onPress={() => setPage("profile")} style={s.profile}>
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
                : page === "notes"
                  ? "PERSONAL NOTES"
                  : "PRIVACY"}
          </Text>
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
        {!wide && (
          <View style={[s.brand, { marginBottom: 26 }]}>
            <Icon name="leaf" />
            <Text style={s.brandText}>co-wingman.</Text>
            <Pressable
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
              ["notes", "Notes"],
              ["about", "Privacy"],
            ].map(([id, label]) => (
              <Pressable key={id} onPress={() => setPage(id)}>
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
                  : "THOUGHTFUL BY DESIGN"}
            </Text>
            <Text style={s.heading}>
              {page === "session"
                ? "Good conversations start\nwith a little curiosity."
                : page === "profile"
                  ? "Your story,\nready when you are."
                  : page === "notes"
                    ? "A little context,\nfor next time."
                    : "Your conversation.\nYour choice."}
            </Text>
            <Text style={s.subtitle}>
              {page === "session"
                ? "Stay in the moment. Your wingman will find the words when you need them."
                : page === "profile"
                  ? "Keep the professional context you want your wingman to know. You can edit or delete it anytime."
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
            <Pressable onPress={() => setError("")}>
              <Icon name="close" color="#9B4C3D" />
            </Pressable>
          </View>
        )}
        {page === "profile" ? (
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
                <TextInput
                  value={profile.skills.join(", ")}
                  onChangeText={(v) =>
                    setProfile({
                      ...profile,
                      skills: v
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .slice(0, 20),
                    })
                  }
                  placeholder="Skills, separated by commas"
                  placeholderTextColor={C.muted}
                  style={s.profileInput}
                />
                <TextInput
                  value={profile.interests.join(", ")}
                  onChangeText={(v) =>
                    setProfile({
                      ...profile,
                      interests: v
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .slice(0, 20),
                    })
                  }
                  placeholder="Interests, separated by commas"
                  placeholderTextColor={C.muted}
                  style={s.profileInput}
                />
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
                  Firebase mode. It is not yet added to AI prompts; that belongs
                  to Milestone 5.
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
                    Used only as a contact label. Profile fetching and NFC are
                    not enabled.
                  </Text>
                  <View style={s.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.toggleTitle}>Remember topic notes</Text>
                      <Text style={s.tiny}>
                        Your personal notes, only if you choose.
                      </Text>
                    </View>
                    <Switch
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
                        <Pressable disabled={!!busy} onPress={end}>
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
                      <Pressable onPress={() => setAutomaticExplanation("")}>
                        <Icon name="close" size={17} color={C.muted} />
                      </Pressable>
                    </View>
                  )}
                  <View style={s.cueList}>
                    {cues.length ? (
                      cues.map((cue, i) => (
                        <Pressable
                          key={cue.id}
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
    width: 29,
    height: 29,
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
});
