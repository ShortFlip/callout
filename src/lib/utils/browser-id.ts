const BROWSER_ID_KEY = 'callout:browser_id';

/**
 * Returns the persistent browser identity UUID, creating it if this is the
 * first visit. Stored in localStorage so it survives page refreshes and
 * tab closes, but NOT shared across browsers or devices.
 *
 * This ID is the fallback identity if the Supabase auth session expires —
 * it's what links an anonymous player to their game history.
 */
export function getBrowserId(): string {
  let id = localStorage.getItem(BROWSER_ID_KEY);
  if (!id) {
    // crypto.randomUUID() is available in all modern browsers
    id = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_KEY, id);
  }
  return id;
}

/**
 * Overwrite the browser identity with an existing player's `browser_id`.
 *
 * Used by the claim-code flow: typing your code on a second PC points that PC
 * at the player row you already have, instead of creating a duplicate. Nothing
 * is written to the database, so the original machine keeps working too.
 * Callers should reload afterwards — identity is resolved once, on mount.
 */
export function setBrowserId(id: string): void {
  localStorage.setItem(BROWSER_ID_KEY, id);
}
