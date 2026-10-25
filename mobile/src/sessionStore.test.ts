import { afterEach, describe, expect, it } from "vitest";
import { clearActiveSession, loadActiveSession, saveActiveSession } from "./sessionStore";

afterEach(() => clearActiveSession());

describe("active session recovery", () => {
  it("stores only the bounded recovery contract and clears it", async () => {
    const stored = {
      ownerId: "owner-123456789012345678901234",
      session: { id: "session-id", token: "secret-capability", mode: "demo", memory: "" },
      startedAtMs: 1_000,
    };
    await saveActiveSession(stored);
    expect(await loadActiveSession()).toEqual(stored);
    await clearActiveSession();
    expect(await loadActiveSession()).toBeNull();
  });
});
