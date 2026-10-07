// Fixture data for the local fake Supabase (scripts/mock-supabase/server.mjs).
//
// Why this exists: every page load signs in anonymously against Supabase, so
// screenshotting against the owner's LIVE project would create users there.
// This file builds a self-contained, realistic world instead: Ryann plus three
// friends, a library with four games (one carrying an uploaded one-colour
// logo), three saved cards, two finished nights in History, and three live
// rooms (lobby, round in progress, round just won).
//
// Shapes follow src/lib/supabase/types.ts and supabase/migrations/. IDs are
// fixed so screenshot URLs and README instructions never drift between runs.
// Room codes use only the app's code alphabet (no O, I, L, 0, 1), so the
// Join box accepts them too.

import { deflateSync } from 'node:zlib';

/** Fixed room codes, documented in README.md. */
export const ROOM_CODES = {
  lobby: 'QUEUE2', // status waiting, Ryann hosts, Dan/Jess/Marco present via fake presence
  playing: 'GAME22', // round 1 active, everyone has marks; Ryann hosts (Swap lives here)
  won: 'CHAMP2', // round 1 won by Dan on a row: the win banner without the ?state= harness
  finished: 'ENDED2', // status finished: Game Over; also History night 2
  pastNight: 'FRDAY2', // status finished: History night 1 (won, won, cancelled)
};

/** localStorage `callout:browser_id` values that log a browser in as each fixture player. */
export const BROWSER_IDS = {
  ryann: 'mock-browser-ryann',
  dan: 'mock-browser-dan',
  jess: 'mock-browser-jess',
  marco: 'mock-browser-marco',
};

// A readable fixed-UUID helper: uuid('a', 1) → 0000000a-0000-4000-8000-000000000001.
function uuid(kind, n) {
  return `${kind.padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const IDS = {
  ryann: uuid('1', 1),
  dan: uuid('1', 2),
  jess: uuid('1', 3),
  marco: uuid('1', 4),
  tagRl: uuid('2', 1),
  tagCod: uuid('2', 2),
  tagVal: uuid('2', 3),
  tagMw: uuid('2', 4),
  tagFunny: uuid('2', 5),
  tagClutch: uuid('2', 6),
  tplFriday: uuid('3', 1),
  tplRanked: uuid('3', 2),
  tplChaos: uuid('3', 3),
};

// ── Tiny PNG encoder ─────────────────────────────────────────────────────────
// Dependency-free so the mock needs nothing installed. Used for the uploaded
// game logo (alpha mask, drawn in the game's colour by GameMark) and one avatar.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode an RGBA image; `pixel(x, y)` returns [r, g, b, a]. */
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw.set([r, g, b, a], row + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** An abstract one-colour mark (diamond ring + dot): a stand-in, never a real game's logo. */
function logoPng() {
  return png(128, (x, y) => {
    const d = Math.abs(x - 64) + Math.abs(y - 64);
    const inside = (d <= 58 && d >= 36) || d <= 16;
    return inside ? [255, 255, 255, 255] : [0, 0, 0, 0];
  });
}

/** A two-tone round-ish avatar so one rail card shows a photo instead of initials. */
function avatarPng() {
  return png(128, (x, y) => {
    const t = (x + y) / 256;
    const inHead = (x - 64) ** 2 + (y - 52) ** 2 < 22 ** 2;
    const inBody = (x - 64) ** 2 + (y - 128) ** 2 < 48 ** 2;
    if (inHead || inBody) return [250, 236, 220, 255];
    return [Math.round(236 - 80 * t), Math.round(72 + 40 * t), Math.round(153 + 60 * t), 255];
  });
}

// ── Deterministic shuffling ──────────────────────────────────────────────────

function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffled(list, seedText) {
  const out = [...list];
  const next = rng(seedText);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── The world ────────────────────────────────────────────────────────────────

/**
 * Build a fresh copy of every table. Called at boot and by POST /__mock/reset.
 * @param {{ baseUrl: string, now?: Date }} options baseUrl is the mock's own origin (storage URLs point at it).
 */
export function buildFixtures({ baseUrl, now = new Date() }) {
  const at = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const DAY = 24 * 60;

  const players = [
    { id: IDS.ryann, display_name: 'Ryann', browser_id: BROWSER_IDS.ryann, claim_code: 'RYAN-2K4M', avatar_url: null },
    { id: IDS.dan, display_name: 'Dan', browser_id: BROWSER_IDS.dan, claim_code: 'DANN-7Q3P', avatar_url: null },
    {
      id: IDS.jess,
      display_name: 'Jess',
      browser_id: BROWSER_IDS.jess,
      claim_code: 'JESS-9W2R',
      avatar_url: `${baseUrl}/storage/v1/object/public/avatars/${IDS.jess}.png`,
    },
    { id: IDS.marco, display_name: 'Marco', browser_id: BROWSER_IDS.marco, claim_code: 'MRCO-4T8X', avatar_url: null },
  ].map((p, i) => ({ ...p, auth_id: uuid('9', i + 1), created_at: at(60 * DAY), updated_at: at(60 * DAY) }));

  const logoUrl = `${baseUrl}/storage/v1/object/public/game-logos/${IDS.tagVal}.png?t=1759500000000`;
  const tags = [
    { id: IDS.tagRl, name: 'Rocket League', kind: 'game', color: 'sky', icon: 'car', logo_url: null },
    { id: IDS.tagCod, name: 'Call of Duty', kind: 'game', color: 'orange', icon: 'crosshair', logo_url: null },
    // The uploaded one-colour logo: GameMark masks it in the game's colour.
    { id: IDS.tagVal, name: 'Valorant', kind: 'game', color: 'rose', icon: 'target', logo_url: logoUrl },
    { id: IDS.tagMw, name: 'Modern Warfare', kind: 'game', color: 'cyan', icon: 'skull', logo_url: null },
    { id: IDS.tagFunny, name: 'Funny', kind: 'tag', color: null, icon: null, logo_url: null },
    { id: IDS.tagClutch, name: 'Clutch', kind: 'tag', color: null, icon: null, logo_url: null },
  ].map((t, i) => ({ ...t, owner_id: IDS.ryann, created_at: at(30 * DAY - i) }));

  const texts = {
    [IDS.tagRl]: [
      'Someone rage quits', 'Forfeit vote', 'Reverse boost fail', 'Whiffed open net', 'Controller disconnects',
      'Calls a bad play', 'Own goal', 'Ceiling shot', 'Demo on kickoff', 'Overtime win', 'Double touch goal',
      'Flip reset attempt',
      // Past the 12 the cards use: spare Rocket League squares, so the host's
      // Swap picker on GAME22 has something to offer.
      'Air dribble goal', 'Kickoff goal', 'Pinch from the corner', 'Save of the century', 'Musty flick',
      'Zero-second goal',
    ],
    [IDS.tagCod]: [
      'Killed by a dog', 'Team wipe', 'Spawn trapped', 'Knife kill', 'Grenade suicide', 'Last one alive',
      'UAV goes up', 'Clutch revive', 'Camping accusation', 'Lag excuse', 'Headshot streak', 'Wrong loadout',
    ],
    [IDS.tagVal]: [
      'Ace round', 'Eco win', 'Spike defuse at 0.1', 'Op one-tap', 'Flashes own team', 'Ninja defuse',
      'Thrifty round', 'Teammate locks duelist', 'Ult on the wrong site', 'Overtime ranked game',
    ],
    [IDS.tagMw]: [
      'Gulag win', 'Loadout drop sniped', 'Buy station campers', 'Plates run out', 'Self-revive clutch',
      'Circle closes on us', 'Third-partied', 'Redeploy flare',
    ],
    none: ['Someone says "one more game"', 'Snack break', 'Mic left on', 'Dog barks on comms', 'Pizza arrives', 'Someone AFK'],
  };

  const library_items = [];
  const library_item_tags = [];
  let itemN = 0;
  for (const [gameKey, list] of Object.entries(texts)) {
    for (const text of list) {
      itemN++;
      const id = uuid('4', itemN);
      library_items.push({
        id,
        owner_id: IDS.ryann,
        text,
        game_tag_id: gameKey === 'none' ? null : gameKey,
        created_at: at(20 * DAY - itemN),
      });
      // A few extra tags so the filter chips have something to show.
      if (itemN % 5 === 0) library_item_tags.push({ item_id: id, tag_id: IDS.tagFunny });
      if (itemN % 7 === 0) library_item_tags.push({ item_id: id, tag_id: IDS.tagClutch });
    }
  }

  const tagById = Object.fromEntries(tags.map((t) => [t.id, t]));
  const legendFor = (gameIds) =>
    gameIds.map((id) => {
      const t = tagById[id];
      const entry = { gameTagId: t.id, name: t.name, color: t.color, icon: t.icon };
      if (t.logo_url) entry.logoUrl = t.logo_url;
      return entry;
    });
  const itemsFor = (lanes) =>
    lanes.flatMap(([gameId, count]) =>
      library_items
        .filter((it) => it.game_tag_id === gameId)
        .slice(0, count)
        .map((it) => ({ text: it.text, libraryItemId: it.id, gameTagId: it.game_tag_id })),
    );

  const templateDefs = [
    { id: IDS.tplFriday, name: 'Friday Squad Night', size: 5, free: true, lanes: [[IDS.tagRl, 12], [IDS.tagCod, 12]], age: 14 * DAY },
    { id: IDS.tplRanked, name: 'Valorant Ranked', size: 4, free: false, lanes: [[IDS.tagVal, 10], [IDS.tagRl, 6]], age: 9 * DAY },
    { id: IDS.tplChaos, name: 'Chaos Mix', size: 5, free: true, lanes: [[IDS.tagRl, 8], [IDS.tagCod, 8], [IDS.tagVal, 8]], age: 4 * DAY },
  ];
  const card_templates = templateDefs.map((d) => ({
    id: d.id,
    creator_id: IDS.ryann,
    name: d.name,
    board_size: d.size,
    free_space: d.free,
    shuffle_mode: 'full',
    is_public: false,
    saved: true,
    items: itemsFor(d.lanes),
    mix: { lanes: d.lanes.map(([gameTagId, count]) => ({ gameTagId, count })) },
    styles: { legend: legendFor(d.lanes.map(([g]) => g)) },
    created_at: at(d.age),
  }));
  const templateById = Object.fromEntries(card_templates.map((t) => [t.id, t]));

  /** A player's card for a round, shaped as generateCard stores it in game_players.card_data. */
  function cardFor(template, seed, playerId) {
    const pool = template.items.map((item, index) => ({ ...item, originalIndex: index }));
    const total = template.board_size ** 2;
    const picked = shuffled(pool, `${seed}:${playerId}`).slice(0, template.free_space ? total - 1 : total);
    if (template.free_space) picked.splice(Math.floor(total / 2), 0, { text: 'FREE', isFreeSpace: true });
    return picked;
  }
  /** Scattered marks, always including the free square so it reads as marked. */
  function marksFor(template, card, count, seedText) {
    const free = card.findIndex((s) => s.isFreeSpace);
    const picks = shuffled([...card.keys()].filter((i) => i !== free), seedText).slice(0, count);
    return (free >= 0 ? [free, ...picks] : picks).sort((a, b) => a - b);
  }
  const rowOf = (size, row) => Array.from({ length: size }, (_, c) => row * size + c);
  const colOf = (size, col) => Array.from({ length: size }, (_, r) => r * size + col);
  const diagOf = (size) => Array.from({ length: size }, (_, i) => i * size + i);

  const rooms = [];
  const games = [];
  const game_players = [];
  const settings = { winPatterns: ['row', 'column', 'diagonal'], gameMode: 'honor' };
  let roomN = 0;
  let gameN = 0;
  let gpN = 0;

  function addRoom({ code, name, status, templateId, createdMinutesAgo }) {
    roomN++;
    const room = {
      id: uuid('5', roomN),
      host_id: IDS.ryann,
      join_code: code,
      name,
      settings,
      status,
      template_id: templateId,
      created_at: at(createdMinutesAgo),
    };
    rooms.push(room);
    return room;
  }

  /**
   * One round. `winners` is [{ who, line, place, ms }]: the winner's marks cover
   * that line; everyone else gets scattered marks.
   */
  function addRound(room, { round, status, startedMinutesAgo, lengthMinutes, pattern = null, winners = [], marks = {} }) {
    gameN++;
    const template = templateById[room.template_id];
    const seed = `mock-seed-${room.join_code}-${round}`;
    const game = {
      id: uuid('6', gameN),
      room_id: room.id,
      round_number: round,
      seed,
      call_list: shuffled([...template.items.keys()], seed),
      calls_made: 0,
      status,
      win_pattern: pattern,
      started_at: at(startedMinutesAgo),
      ended_at: status === 'active' ? null : at(startedMinutesAgo - lengthMinutes),
    };
    games.push(game);
    for (const who of ['ryann', 'dan', 'jess', 'marco']) {
      gpN++;
      const playerId = IDS[who];
      const card = cardFor(template, seed, playerId);
      const win = winners.find((w) => w.who === who);
      const base = marksFor(template, card, marks[who] ?? 7, `${seed}:${who}:marks`);
      const playerMarks = win ? [...new Set([...base, ...win.line])].sort((a, b) => a - b) : base;
      game_players.push({
        id: uuid('7', gpN),
        game_id: game.id,
        player_id: playerId,
        card_data: card,
        marks: playerMarks,
        won: !!win,
        finish_position: win?.place ?? null,
        bingo_time_ms: win?.ms ?? null,
      });
    }
    return game;
  }

  // History night 1: two days ago, Chaos Mix. Jess, then Ryann, then a cancelled round.
  const friday = addRoom({ code: ROOM_CODES.pastNight, name: 'Friday Night Squares', status: 'finished', templateId: IDS.tplChaos, createdMinutesAgo: 2 * DAY + 60 });
  addRound(friday, { round: 1, status: 'won', startedMinutesAgo: 2 * DAY + 55, lengthMinutes: 18, pattern: 'diagonal', winners: [{ who: 'jess', line: diagOf(5), place: 1, ms: 17 * 60_000 + 12_000 }] });
  addRound(friday, { round: 2, status: 'won', startedMinutesAgo: 2 * DAY + 30, lengthMinutes: 14, pattern: 'row', winners: [{ who: 'ryann', line: rowOf(5, 1), place: 1, ms: 13 * 60_000 + 40_000 }, { who: 'marco', line: colOf(5, 3), place: 2, ms: 14 * 60_000 + 5_000 }] });
  addRound(friday, { round: 3, status: 'cancelled', startedMinutesAgo: 2 * DAY + 12, lengthMinutes: 4, marks: { ryann: 3, dan: 2, jess: 4, marco: 1 } });

  // History night 2 and the Game Over screen: yesterday, Valorant Ranked (4×4, no free square).
  const ended = addRoom({ code: ROOM_CODES.finished, name: 'Ranked Grind', status: 'finished', templateId: IDS.tplRanked, createdMinutesAgo: DAY + 90 });
  addRound(ended, { round: 1, status: 'won', startedMinutesAgo: DAY + 85, lengthMinutes: 22, pattern: 'column', winners: [{ who: 'dan', line: colOf(4, 2), place: 1, ms: 21 * 60_000 + 3_000 }] });
  addRound(ended, { round: 2, status: 'won', startedMinutesAgo: DAY + 55, lengthMinutes: 16, pattern: 'row', winners: [{ who: 'ryann', line: rowOf(4, 0), place: 1, ms: 15 * 60_000 + 30_000 }] });

  // Live: a lobby nobody has started yet.
  addRoom({ code: ROOM_CODES.lobby, name: 'Tuesday Squad', status: 'waiting', templateId: IDS.tplFriday, createdMinutesAgo: 3 });

  // Live: a round in progress, Ryann hosting. Two games on the card, so Swap appears.
  const playing = addRoom({ code: ROOM_CODES.playing, name: 'Game Night', status: 'playing', templateId: IDS.tplFriday, createdMinutesAgo: 25 });
  addRound(playing, { round: 1, status: 'active', startedMinutesAgo: 20, lengthMinutes: 0, marks: { ryann: 8, dan: 11, jess: 6, marco: 9 } });

  // Live: a round Dan has just won on row 2 (the win banner).
  const champ = addRoom({ code: ROOM_CODES.won, name: 'Late Session', status: 'playing', templateId: IDS.tplChaos, createdMinutesAgo: 40 });
  addRound(champ, { round: 1, status: 'won', startedMinutesAgo: 30, lengthMinutes: 1, pattern: 'row', winners: [{ who: 'dan', line: rowOf(5, 2), place: 1, ms: 29 * 60_000 + 2_000 }], marks: { ryann: 10, jess: 9, marco: 7 } });

  return {
    tables: {
      players,
      tags,
      library_items,
      library_item_tags,
      card_templates,
      rooms,
      games,
      game_players,
      game_nights: [],
    },
    // Storage objects keyed "<bucket>/<path>", served at /storage/v1/object/public/<bucket>/<path>.
    storage: {
      [`game-logos/${IDS.tagVal}.png`]: { contentType: 'image/png', body: logoPng() },
      [`avatars/${IDS.jess}.png`]: { contentType: 'image/png', body: avatarPng() },
    },
  };
}
