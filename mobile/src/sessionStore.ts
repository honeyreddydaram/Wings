export type StoredSession = {
  ownerId: string;
  session: { id: string; token: string; mode: string; memory: string };
  startedAtMs: number;
};

const KEY = "cowingman.active-session.v1";
let memoryValue: string | null = null;

function storage(): Storage | null {
  return typeof globalThis !== "undefined" && "sessionStorage" in globalThis
    ? globalThis.sessionStorage
    : null;
}

export async function saveActiveSession(value: StoredSession): Promise<void> {
  const encoded = JSON.stringify(value);
  const target = storage();
  if (target) target.setItem(KEY, encoded);
  else memoryValue = encoded;
}

export async function loadActiveSession(): Promise<StoredSession | null> {
  const encoded = storage()?.getItem(KEY) ?? memoryValue;
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
  storage()?.removeItem(KEY);
  memoryValue = null;
}
