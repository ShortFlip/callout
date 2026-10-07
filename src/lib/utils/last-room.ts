const KEY = 'callout:last_room';

export interface LastRoom {
  code: string;
  name: string | null;
  /** ISO timestamp of when the player was last in this room. */
  savedAt: string;
}

/**
 * Remember the room a player is in so the landing page can offer a one-click
 * Rejoin. DESIGN.md: "Never make me type a room code I was already in."
 *
 * Every access is wrapped: localStorage throws in private mode and in some
 * embedded browsers, and losing the rejoin chip must never break the page.
 */
export function saveLastRoom(code: string, name: string | null): void {
  try {
    const value: LastRoom = { code, name, savedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Non-fatal: the player just types the code like before.
  }
}

export function getLastRoom(): LastRoom | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastRoom>;
    if (typeof parsed?.code !== 'string' || typeof parsed?.savedAt !== 'string') return null;
    return { code: parsed.code, name: parsed.name ?? null, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function clearLastRoom(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Non-fatal.
  }
}
