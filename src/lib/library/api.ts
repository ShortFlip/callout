import { createClient } from '@/lib/supabase/client';
import { isGameColorKey, isGameIconKey } from '@/lib/game-colors';
import { planImport, textKey } from '@/lib/library/card-draft';
import { FULL_COLOUR_TAG } from '@/lib/library/logo-image';
import type { HeatRow } from '@/lib/library/heat';
import { isScoredRound } from '@/lib/game/stats';
import { hostCardName, type HostDraft } from '@/lib/library/hosting';
import type { Json } from '@/lib/supabase/types';
import type { CardStyles, CardTemplate, SquareItem } from '@/types/card';
import type { CardMix, GameColorKey, GameIconKey, LibraryItem, Tag, TagKind } from '@/types/library';

/*
 * Every read and write the library page makes, over the browser Supabase
 * client. Owner only: every read filters on the owner's player id.
 *
 * RLS lets anyone insert, but update and delete only pass when the caller's
 * anonymous auth session is the row owner's (players.auth_id). When it is not,
 * Postgres does not error: it silently touches 0 rows (build plan, pre-flight
 * finding 4). So every update and delete here asks for the touched ids back
 * with .select() and treats a short answer as a failure.
 *
 * Errors surface as LibraryError, whose message is written for a person and
 * never contains the database's own text. The raw error is logged in
 * development only.
 */

/** A failure with a message that is safe to show in a toast. */
export class LibraryError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LibraryError';
  }
}

/** Postgres unique_violation: the (owner, lower(name|text)) indexes. */
const UNIQUE_VIOLATION = '23505';

/** PostgREST returns at most 1,000 rows per request; page through anything bigger. */
const PAGE = 1000;

/** Ids per `.in()` filter, so a bulk action on hundreds of rows never builds an overlong URL. */
const CHUNK = 100;

function logDev(context: string, error: unknown): void {
  if (process.env.NODE_ENV !== 'production') console.error(`[library] ${context}:`, error);
}

function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

/** Log the raw error, then throw the human one. */
function fail(context: string, message: string, error?: unknown): never {
  logDev(context, error ?? message);
  throw new LibraryError(message, error);
}

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** An update or delete that came back short was blocked by RLS (or the rows are gone). */
function expectRows(context: string, message: string, touched: number, expected: number): void {
  if (touched < expected) fail(context, message, `expected ${expected} rows, touched ${touched}`);
}

type TagRow = {
  id: string;
  owner_id: string;
  name: string;
  kind: string;
  color: string | null;
  icon: string | null;
  logo_url: string | null;
};

function toTag(row: TagRow): Tag {
  const kind: TagKind = row.kind === 'game' ? 'game' : 'tag';
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    kind,
    // Narrowed, never cast: a colour or icon key the app does not know draws nothing.
    color: kind === 'game' && isGameColorKey(row.color) ? row.color : null,
    icon: kind === 'game' && isGameIconKey(row.icon) ? row.icon : null,
    logoUrl: kind === 'game' ? row.logo_url : null,
  };
}

/** The owner's items (newest first, with their extra tags) and tags (oldest first). */
export async function loadLibrary(ownerId: string): Promise<{ items: LibraryItem[]; tags: Tag[] }> {
  const supabase = createClient();
  try {
    const { data: tagRows, error: tagError } = await supabase
      .from('tags')
      .select('id, owner_id, name, kind, color, icon, logo_url')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
      .order('name', { ascending: true });
    if (tagError) throw tagError;

    const items: LibraryItem[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('library_items')
        .select('id, text, game_tag_id, library_item_tags ( tag_id )')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .order('text', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const row of data ?? []) {
        items.push({
          id: row.id,
          text: row.text,
          gameTagId: row.game_tag_id,
          tagIds: (row.library_item_tags ?? []).map((link) => link.tag_id),
        });
      }
      if (!data || data.length < PAGE) break;
    }

    return { items, tags: (tagRows ?? []).map(toTag) };
  } catch (error) {
    fail('loadLibrary', 'Could not load your library. Refresh to try again.', error);
  }
}

/**
 * Add a pasted list. Skips anything the owner already has (trimmed,
 * case-insensitive) and repeats within the paste, then tags what was added.
 * The DB's unique index is the backstop: a text that slipped in meanwhile
 * comes back as 23505 and is counted as skipped, not as a failure.
 *
 * The Add an Item row adds one item through here too (one insert path, one
 * dedupe rule); it passes its own `message` so a failure does not talk about
 * a list he never pasted.
 */
export async function importItems(
  ownerId: string,
  texts: string[],
  gameTagId: string | null,
  tagIds: string[],
  message = 'Could not import that list. Nothing was added.',
): Promise<{ added: number; skipped: number; items: LibraryItem[] }> {
  const supabase = createClient();

  const existing: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('library_items')
      .select('text')
      .eq('owner_id', ownerId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) fail('importItems: existing', message, error);
    existing.push(...(data ?? []).map((row) => row.text));
    if (!data || data.length < PAGE) break;
  }

  const { fresh, skipped: alreadyThere } = planImport(texts, existing);
  let skipped = alreadyThere;
  const inserted: { id: string; text: string; game_tag_id: string | null }[] = [];

  const rows = fresh.map((text) => ({ owner_id: ownerId, text, game_tag_id: gameTagId }));
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('library_items')
      .insert(rows)
      .select('id, text, game_tag_id');
    if (!error) {
      inserted.push(...(data ?? []));
    } else if (isUnique(error)) {
      // Someone (another tab) added one of these meanwhile and the whole batch
      // was refused. Go one by one so only the clashes are skipped.
      for (const row of rows) {
        const one = await supabase.from('library_items').insert(row).select('id, text, game_tag_id').single();
        if (one.error && isUnique(one.error)) skipped++;
        else if (one.error) fail('importItems: insert one', message, one.error);
        else inserted.push(one.data);
      }
    } else {
      fail('importItems: insert', message, error);
    }
  }

  const links = inserted.flatMap((item) => tagIds.map((tagId) => ({ item_id: item.id, tag_id: tagId })));
  for (const batch of chunks(links, 500)) {
    const { error } = await supabase.from('library_item_tags').insert(batch);
    if (error) fail('importItems: tags', 'The items were added, but their tags were not. Add the tags from the list.', error);
  }

  return {
    added: inserted.length,
    skipped,
    items: inserted.map((row) => ({ id: row.id, text: row.text, gameTagId: row.game_tag_id, tagIds: [...tagIds] })),
  };
}

/** Rename one item. The text is trimmed and must not be blank or already in the library. */
export async function updateItemText(itemId: string, text: string): Promise<string> {
  const next = text.trim();
  if (!next) throw new LibraryError('An item needs some text.');
  const { data, error } = await createClient()
    .from('library_items')
    .update({ text: next })
    .eq('id', itemId)
    .select('id');
  if (error && isUnique(error)) fail('updateItemText', `You already have an item called “${next}”.`, error);
  if (error) fail('updateItemText', 'Could not rename that item.', error);
  expectRows('updateItemText', 'Could not rename that item. Refresh and try again.', data?.length ?? 0, 1);
  return next;
}

/** Put items in a game, or in No Game with null. */
export async function setGame(itemIds: string[], gameTagId: string | null): Promise<void> {
  const supabase = createClient();
  const message = itemIds.length === 1 ? 'Could not change that item’s game.' : 'Could not change the game for every item.';
  let touched = 0;
  for (const ids of chunks(itemIds)) {
    const { data, error } = await supabase
      .from('library_items')
      .update({ game_tag_id: gameTagId })
      .in('id', ids)
      .select('id');
    if (error) fail('setGame', message, error);
    touched += data?.length ?? 0;
  }
  expectRows('setGame', `${message} Refresh and try again.`, touched, itemIds.length);
}

/** Add an extra tag to items. Items that already carry it are left alone. */
export async function addTag(itemIds: string[], tagId: string): Promise<void> {
  const supabase = createClient();
  for (const ids of chunks(itemIds)) {
    // An insert is never silently blocked (insert is open), so a plain error
    // check is enough; ignoreDuplicates makes re-tagging a no-op, not a clash.
    const { error } = await supabase
      .from('library_item_tags')
      .upsert(ids.map((id) => ({ item_id: id, tag_id: tagId })), { onConflict: 'item_id,tag_id', ignoreDuplicates: true });
    if (error) fail('addTag', 'Could not add that tag.', error);
  }
}

/** Remove an extra tag. Pass only items that carry it: every one must come back as removed. */
export async function removeTag(itemIds: string[], tagId: string): Promise<void> {
  const supabase = createClient();
  let touched = 0;
  for (const ids of chunks(itemIds)) {
    const { data, error } = await supabase
      .from('library_item_tags')
      .delete()
      .eq('tag_id', tagId)
      .in('item_id', ids)
      .select('item_id');
    if (error) fail('removeTag', 'Could not remove that tag.', error);
    touched += data?.length ?? 0;
  }
  expectRows('removeTag', 'Could not remove that tag. Refresh and try again.', touched, itemIds.length);
}

/** Delete items. Saved cards keep their own copies, so no card changes. */
export async function deleteItems(itemIds: string[]): Promise<void> {
  const supabase = createClient();
  let touched = 0;
  for (const ids of chunks(itemIds)) {
    const { data, error } = await supabase.from('library_items').delete().in('id', ids).select('id');
    if (error) fail('deleteItems', 'Could not delete those items.', error);
    touched += data?.length ?? 0;
  }
  expectRows('deleteItems', 'Could not delete every item. Refresh and try again.', touched, itemIds.length);
}

/** Create a game (colour + icon required) or an extra tag. Names are unique per owner, ignoring case. */
export async function createTag(
  ownerId: string,
  input: { name: string; kind: TagKind; color?: GameColorKey | null; icon?: GameIconKey | null },
): Promise<Tag> {
  const name = input.name.trim();
  if (!name) throw new LibraryError('Give it a name first.');
  if (input.kind === 'game' && (!input.color || !input.icon)) {
    throw new LibraryError('Pick a colour and an icon for the game.');
  }
  const { data, error } = await createClient()
    .from('tags')
    .insert({
      owner_id: ownerId,
      name,
      kind: input.kind,
      color: input.kind === 'game' ? input.color : null,
      icon: input.kind === 'game' ? input.icon : null,
    })
    .select('id, owner_id, name, kind, color, icon, logo_url')
    .single();
  if (error && isUnique(error)) fail('createTag', `You already have a tag called “${name}”.`, error);
  if (error || !data) fail('createTag', input.kind === 'game' ? 'Could not create that game.' : 'Could not create that tag.', error);
  return toTag(data);
}

const LOGO_BUCKET = 'game-logos';

/**
 * Upload a game's logo (already shrunk to a 128px PNG by the caller) and point
 * the tag at it, or clear it with `png = null`. Returns the new URL or null.
 * The file is named by the tag id so a re-upload replaces it; the ?t= stamp
 * busts the CDN cache the way avatars do. A full-colour logo's URL ends in
 * FULL_COLOUR_TAG so GameMark keeps its pixels; anything else is drawn as a
 * silhouette in the game's colour. Owner only: a blocked update fails.
 */
export async function setGameLogo(tagId: string, logo: { png: Blob; fullColour: boolean } | null): Promise<string | null> {
  const supabase = createClient();
  const path = `${tagId}.png`;
  let logoUrl: string | null = null;
  const png = logo?.png ?? null;
  if (png) {
    const { error: uploadError } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, png, { upsert: true, contentType: 'image/png' });
    if (uploadError) fail('setGameLogo: upload', 'Could not upload that logo.', uploadError);
    logoUrl = `${supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl}?t=${Date.now()}${logo?.fullColour ? FULL_COLOUR_TAG : ''}`;
  }
  const { data, error } = await supabase.from('tags').update({ logo_url: logoUrl }).eq('id', tagId).select('id');
  if (error) fail('setGameLogo: update', 'Could not save that logo.', error);
  expectRows('setGameLogo: update', 'Could not save that logo. Refresh and try again.', data?.length ?? 0, 1);
  // Removing the logo also removes the file; a leftover file is harmless, so a failure here is ignored.
  if (!png) await supabase.storage.from(LOGO_BUCKET).remove([path]);
  return logoUrl;
}

/**
 * Give every saved card that shows this game the new logo, so a card saved
 * before the upload picks it up without being rebuilt. A card's legend is what
 * the board reads at play time. Returns how many cards changed.
 */
export async function patchCardLegends(cards: CardTemplate[], gameTagId: string, logoUrl: string | null): Promise<number> {
  const supabase = createClient();
  let changed = 0;
  for (const card of cards) {
    const styles = (card.styles ?? {}) as CardStyles;
    const legend = Array.isArray(styles.legend) ? styles.legend : [];
    if (!legend.some((entry) => entry.gameTagId === gameTagId)) continue;
    const next = legend.map((entry) => {
      if (entry.gameTagId !== gameTagId) return entry;
      // Drop the key entirely on removal, so the card reads exactly as one saved before logos.
      const rest = { ...entry };
      delete rest.logoUrl;
      return logoUrl ? { ...rest, logoUrl } : rest;
    });
    const { data, error } = await supabase
      .from('card_templates')
      .update({ styles: { ...styles, legend: next } as unknown as Json })
      .eq('id', card.id)
      .select('id');
    if (error) fail('patchCardLegends', `Could not update “${card.name}”.`, error);
    expectRows('patchCardLegends', `Could not update “${card.name}”. Refresh and try again.`, data?.length ?? 0, 1);
    changed++;
  }
  return changed;
}

/**
 * Every counted card from every round in the owner's rooms, for item heat.
 * Scoped like /leaderboard (Decision B): step one finds the rooms he has
 * played in, step two reads every player's row from every round of those
 * rooms. Won rounds count in full. Rounds left "active" (the host closed the
 * tab instead of ending the night, which is most of the real history) count
 * per card, only once that player marked something, so an untouched
 * card can't drag a rate down. Cancelled rounds never count.
 */
export async function loadHeatRows(ownerId: string): Promise<HeatRow[]> {
  const supabase = createClient();
  try {
    const { data: mine, error: mineError } = await supabase
      .from('game_players')
      .select('games!game_players_game_id_fkey (room_id)')
      .eq('player_id', ownerId);
    if (mineError) throw mineError;

    const roomIds = Array.from(new Set(
      (mine ?? [])
        .map((row) => (row.games as { room_id: string } | null)?.room_id)
        .filter((id): id is string => !!id),
    ));
    if (roomIds.length === 0) return [];

    const rows: HeatRow[] = [];
    for (const ids of chunks(roomIds)) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('game_players')
          .select('id, card_data, marks, games!inner ( room_id, status )')
          .in('games.room_id', ids)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const row of data ?? []) {
          const game = row.games as unknown as { status: string } | null;
          const played = Array.isArray(row.marks) && row.marks.length > 0;
          if (!isScoredRound(game?.status) && !(game?.status === 'active' && played)) continue;
          rows.push({ cardData: row.card_data, marks: row.marks });
        }
        if (!data || data.length < PAGE) break;
      }
    }
    return rows;
  } catch (error) {
    fail('loadHeatRows', 'Could not load item heat. The library still works.', error);
  }
}

/** The owner's saved cards (saved = true), newest first. */
export async function loadSavedCards(ownerId: string): Promise<CardTemplate[]> {
  const { data, error } = await createClient()
    .from('card_templates')
    .select('*')
    .eq('creator_id', ownerId)
    .eq('saved', true)
    .order('created_at', { ascending: false });
  if (error) fail('loadSavedCards', 'Could not load your saved cards.', error);
  return data ?? [];
}

/** One card by id, owner only. Used by /library?card=<id>. */
export async function loadCard(ownerId: string, cardId: string): Promise<CardTemplate | null> {
  const { data, error } = await createClient()
    .from('card_templates')
    .select('*')
    .eq('id', cardId)
    .eq('creator_id', ownerId)
    .maybeSingle();
  if (error) fail('loadCard', 'Could not open that card.', error);
  return data;
}

export interface SaveCardInput {
  /** Update this card; omit to insert a new one. */
  id?: string | null;
  ownerId: string;
  name: string;
  boardSize: number;
  freeSpace: boolean;
  styles: CardStyles;
  items: SquareItem[];
  mix: CardMix;
}

/** Insert a saved card, or update one by id. Returns the card's id. */
export async function saveCard(input: SaveCardInput): Promise<string> {
  const supabase = createClient();
  const name = input.name.trim();
  const payload = {
    name,
    board_size: input.boardSize,
    free_space: input.freeSpace,
    shuffle_mode: 'full',
    styles: input.styles as unknown as Json,
    items: input.items as unknown as Json,
    mix: input.mix as unknown as Json,
    saved: true,
    is_public: false,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from('card_templates')
      .update(payload)
      .eq('id', input.id)
      .select('id');
    if (error) fail('saveCard: update', `Could not save “${name}”.`, error);
    expectRows('saveCard: update', `Could not save “${name}”. Refresh and try again.`, data?.length ?? 0, 1);
    return input.id;
  }

  const { data, error } = await supabase
    .from('card_templates')
    .insert({ ...payload, creator_id: input.ownerId })
    .select('id')
    .single();
  if (error || !data) fail('saveCard: insert', `Could not save “${name}”.`, error);
  return data.id;
}

/**
 * Take a card off Saved Cards. Never a delete: past nights read the row
 * through rooms.template_id for their name, style and legend, so it stays,
 * as a saved = false copy. Owner only, so a blocked update (0 rows) fails.
 */
export async function unsaveCard(cardId: string, name: string): Promise<void> {
  const { data, error } = await createClient()
    .from('card_templates')
    .update({ saved: false })
    .eq('id', cardId)
    .select('id');
  if (error) fail('unsaveCard', `Could not remove “${name}”.`, error);
  expectRows('unsaveCard', `Could not remove “${name}”. Refresh and try again.`, data?.length ?? 0, 1);
}

/**
 * Insert an unsaved card as its own card_templates row (saved = false), so the
 * room hosting it has a template_id like every other room. Returns the new id.
 */
export async function insertUnsavedCard(ownerId: string, draft: HostDraft): Promise<string> {
  const { data, error } = await createClient()
    .from('card_templates')
    .insert({
      creator_id: ownerId,
      name: hostCardName(draft.name),
      board_size: draft.boardSize,
      free_space: draft.freeSpace,
      shuffle_mode: 'full',
      styles: draft.styles as unknown as Json,
      items: draft.items as unknown as Json,
      mix: draft.mix as unknown as Json,
      saved: false,
      is_public: false,
    })
    .select('id')
    .single();
  if (error || !data) fail('insertUnsavedCard', 'Could not set up this card for the room.', error);
  return data.id;
}

/**
 * What Create Room offers: my saved cards (newest first) and the card behind
 * my most recently hosted room, which may be an unsaved copy. The latest
 * room's card is null when that room has no template_id or the row is gone.
 */
export async function loadHostChoices(
  ownerId: string,
): Promise<{ saved: CardTemplate[]; lastRoomCard: CardTemplate | null }> {
  const supabase = createClient();
  const saved = await loadSavedCards(ownerId);

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('template_id')
    .eq('host_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (roomError) fail('loadHostChoices: room', 'Could not load your last card.', roomError);

  const templateId = room?.template_id;
  if (!templateId) return { saved, lastRoomCard: null };
  const known = saved.find((card) => card.id === templateId);
  if (known) return { saved, lastRoomCard: known };

  const { data: card, error: cardError } = await supabase
    .from('card_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();
  if (cardError) fail('loadHostChoices: card', 'Could not load your last card.', cardError);
  return { saved, lastRoomCard: card };
}

/** Same name, ignoring case and outer spaces. Saved-card and tag names clash on this. */
export function sameName(a: string, b: string): boolean {
  return textKey(a) === textKey(b);
}
