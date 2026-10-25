import * as SecureStore from "expo-secure-store";
import type { StoredSession } from "./sessionStore";

const KEY = "cowingman.active-session.v1";

export async function saveActiveSession(value: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(value), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadActiveSession(): Promise<StoredSession | null> {
  const encoded = await SecureStore.getItemAsync(KEY);
  if (!encoded) return null;
  try {
    const value = JSON.parse(encoded) as StoredSession;
    if (!value.ownerId || !value.session?.id || !value.session?.token || !value.startedAtMs) return null;
    return value;
  } catch {
    return null;
  }
}

export async function clearActiveSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
