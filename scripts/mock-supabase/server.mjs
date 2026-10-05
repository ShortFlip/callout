// Local fake Supabase for screenshots and UI checks.
//
// Why: every page load calls supabase.auth.signInAnonymously(), and the app's
// only Supabase is the owner's LIVE project. Pointing the app here instead
// means no test run can ever create users or rows there. No Docker on this
// machine, so `supabase start` is not an option; this is a dependency-free
// Node server that answers exactly the endpoints supabase-js calls:
//
//   /auth/v1/*          anonymous sign-in, token refresh, user, logout
//   /rest/v1/<table>    PostgREST subset: select with embeds, eq/in/is/…,
//                       order, limit/offset, single, insert/upsert/update/delete
//   /rest/v1/rpc/*      generate_claim_code
//   /storage/v1/*       public object reads, uploads, removes (in memory)
//   /realtime/v1/websocket  Phoenix channels: join, heartbeat, broadcast relay,
//                       presence (with fake friends online), postgres_changes
//
// Everything lives in memory and resets on restart (or POST /__mock/reset).
// It binds 127.0.0.1 only. Every request is logged to stdout.
//
// Run: node scripts/mock-supabase/server.mjs   (or `npm run dev:mock`)

import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { buildFixtures, IDS } from './fixtures.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54399);
const BASE_URL = `http://${HOST}:${PORT}`;
// Which fixture player an unknown browser becomes. A fresh headless browser has
// a random browser_id, so without this every screenshot would start at the
// "what's your name?" prompt. MOCK_ADOPT=none turns it off to see that prompt.
const ADOPT = (process.env.MOCK_ADOPT ?? 'ryann').toLowerCase();
// Fake friends shown as present in every live room, so the lobby and the rail
// look like a real night. MOCK_FRIENDS_ONLINE=0 turns it off.
const FRIENDS_ONLINE = process.env.MOCK_FRIENDS_ONLINE !== '0';

let db;
let storage;
function reset() {
  const fx = buildFixtures({ baseUrl: BASE_URL });
  db = fx.tables;
  storage = fx.storage;
}
reset();

// ── Schema knowledge ─────────────────────────────────────────────────────────

/** Foreign keys, named as PostgREST names them (the app uses these as embed hints). */
const FKS = [
  { name: 'card_templates_creator_id_fkey', from: 'card_templates', col: 'creator_id', to: 'players' },
  { name: 'game_players_game_id_fkey', from: 'game_players', col: 'game_id', to: 'games' },
  { name: 'game_players_player_id_fkey', from: 'game_players', col: 'player_id', to: 'players' },
  { name: 'games_room_id_fkey', from: 'games', col: 'room_id', to: 'rooms' },
  { name: 'library_item_tags_item_id_fkey', from: 'library_item_tags', col: 'item_id', to: 'library_items' },
  { name: 'library_item_tags_tag_id_fkey', from: 'library_item_tags', col: 'tag_id', to: 'tags' },
  { name: 'library_items_game_tag_id_fkey', from: 'library_items', col: 'game_tag_id', to: 'tags' },
  { name: 'library_items_owner_id_fkey', from: 'library_items', col: 'owner_id', to: 'players' },
  { name: 'rooms_host_id_fkey', from: 'rooms', col: 'host_id', to: 'players' },
  { name: 'rooms_template_id_fkey', from: 'rooms', col: 'template_id', to: 'card_templates' },
  { name: 'tags_owner_id_fkey', from: 'tags', col: 'owner_id', to: 'players' },
];

/** Unique constraints (a function maps a row to its key), for 23505 and upsert on_conflict. */
const UNIQUES = {
  players: [['id'], ['browser_id'], ['claim_code']],
  rooms: [['id'], ['join_code']],
  games: [['id'], ['room_id', 'round_number']],
  game_players: [['id'], ['game_id', 'player_id']],
  card_templates: [['id']],
  tags: [['id'], ['owner_id', (r) => String(r.name).toLowerCase()]],
  library_items: [['id'], ['owner_id', (r) => String(r.text).toLowerCase()]],
  library_item_tags: [['item_id', 'tag_id']],
  game_nights: [['id']],
};

/** Column defaults applied on insert, mirroring the migrations. */
function defaults(table) {
  const now = new Date().toISOString();
  const id = randomUUID();
  switch (table) {
    case 'players':
      return { id, auth_id: null, avatar_url: null, claim_code: claimCode(), created_at: now, updated_at: now };
    case 'card_templates':
      return { id, items: [], styles: {}, mix: null, shuffle_mode: 'full', free_space: true, is_public: false, saved: true, created_at: now };
    case 'rooms':
      return { id, name: null, status: 'waiting', settings: {}, template_id: null, created_at: now };
    case 'games':
      return { id, call_list: [], calls_made: 0, status: 'active', win_pattern: null, started_at: now, ended_at: null };
    case 'game_players':
      return { id, card_data: [], marks: [], won: false, finish_position: null, bingo_time_ms: null };
    case 'tags':
      return { id, kind: 'tag', color: null, icon: null, logo_url: null, created_at: now };
    case 'library_items':
      return { id, game_tag_id: null, created_at: now };
    case 'game_nights':
      return { id, name: null, room_ids: [], created_at: now };
    default:
      return {};
  }
}

function claimCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────

function log(line) {
  const stamp = new Date().toISOString().slice(11, 23);
  console.log(`[mock-supabase ${stamp}] ${line}`);
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
    'Access-Control-Expose-Headers': 'Content-Range, X-Supabase-Api-Version, Content-Type',
    'Access-Control-Max-Age': '600',
  };
}

function send(req, res, status, body, extraHeaders = {}) {
  const headers = { ...corsHeaders(req), ...extraHeaders };
  if (body === undefined || body === null) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  if (Buffer.isBuffer(body)) {
    res.writeHead(status, { 'Content-Type': 'application/octet-stream', ...headers });
    res.end(body);
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

function parseJson(buf) {
  if (!buf || buf.length === 0) return null;
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
}

class PgError extends Error {
  constructor(status, code, message, details = null, hint = null) {
    super(message);
    this.status = status;
    this.body = { code, message, details, hint };
  }
}

// ── Auth (GoTrue subset) ─────────────────────────────────────────────────────

const users = new Map(); // id → user
const refreshTokens = new Map(); // token → user id

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** A JWT-shaped token. Nothing verifies the signature; realtime-js only reads exp. */
function jwt(payload) {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${randomBytes(16).toString('base64url')}`;
}

function newUser() {
  const now = new Date().toISOString();
  const user = {
    id: randomUUID(),
    aud: 'authenticated',
    role: 'authenticated',
    email: '',
    phone: '',
    app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
    user_metadata: {},
    identities: [],
    is_anonymous: true,
    created_at: now,
    updated_at: now,
    last_sign_in_at: now,
  };
  users.set(user.id, user);
  return user;
}

function sessionFor(user) {
  const iat = Math.floor(Date.now() / 1000);
  const expiresIn = 60 * 60 * 24 * 7;
  const refresh = randomBytes(12).toString('hex');
  refreshTokens.set(refresh, user.id);
  return {
    access_token: jwt({ sub: user.id, role: 'authenticated', aud: 'authenticated', is_anonymous: true, iat, exp: iat + expiresIn, iss: `${BASE_URL}/auth/v1` }),
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: iat + expiresIn,
    refresh_token: refresh,
    user,
  };
}

function userFromAuthHeader(req) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return users.get(payload.sub) ?? null;
  } catch {
    return null;
  }
}

async function handleAuth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  if (path === '/signup' && req.method === 'POST') {
    await readBody(req);
    return send(req, res, 200, sessionFor(newUser()));
  }
  if (path === '/token' && req.method === 'POST') {
    const body = parseJson(await readBody(req)) ?? {};
    const userId = refreshTokens.get(body.refresh_token);
    // An unknown refresh token (server restarted) still gets a session, so a
    // restart never strands an open tab on a sign-in error.
    const user = (userId && users.get(userId)) || newUser();
    return send(req, res, 200, sessionFor(user));
  }
  if (path === '/user') {
    const user = userFromAuthHeader(req);
    if (!user) return send(req, res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    if (req.method === 'PUT') {
      const body = parseJson(await readBody(req)) ?? {};
      Object.assign(user.user_metadata, body.data ?? {});
    }
    return send(req, res, 200, user);
  }
  if (path === '/logout') return send(req, res, 204, null);
  if (path === '/settings') {
    return send(req, res, 200, { external: { anonymous_users: true }, disable_signup: false, mailer_autoconfirm: true });
  }
  if (path === '/health') return send(req, res, 200, { name: 'mock-gotrue' });
  return send(req, res, 404, { code: 404, msg: `mock auth has no ${req.method} ${path}` });
}

// ── PostgREST subset ─────────────────────────────────────────────────────────

/** Split on commas at paren depth 0, outside double quotes. */
function splitTop(text) {
  const out = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (!quoted && depth === 0 && ch === ',') {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current !== '') out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse a select string into nodes:
 *   { kind: 'all' } | { kind: 'col', name, alias } | { kind: 'embed', alias, rel, hint, inner, children }
 */
function parseSelect(text) {
  if (!text) return [{ kind: 'all' }];
  return splitTop(text.replace(/\s+/g, '')).map((part) => {
    const open = part.indexOf('(');
    if (open === -1) {
      if (part === '*') return { kind: 'all' };
      let [alias, name] = part.includes(':') ? part.split(':') : [null, part];
      name = name.split('::')[0];
      return { kind: 'col', name, alias: alias ?? name };
    }
    const head = part.slice(0, open);
    const inner = part.slice(open + 1, part.lastIndexOf(')'));
    let alias = null;
    let target = head;
    if (head.includes(':')) [alias, target] = head.split(':');
    const [rel, ...mods] = target.split('!');
    const isInner = mods.includes('inner');
    const hint = mods.find((m) => m !== 'inner' && m !== 'left') ?? null;
    return { kind: 'embed', alias: alias ?? rel, rel, hint, inner: isInner, children: parseSelect(inner) };
  });
}

/** Find how `rel` hangs off `table`: many-to-one (object) or one-to-many (array). */
function resolveRelation(table, rel, hint) {
  const candidates = [];
  for (const fk of FKS) {
    if (hint && fk.name !== hint) continue;
    if (fk.from === table && fk.to === rel) candidates.push({ fk, many: false });
    if (fk.to === table && fk.from === rel) candidates.push({ fk, many: true });
  }
  if (candidates.length === 0) {
    throw new PgError(400, 'PGRST200', `Could not find a relationship between '${table}' and '${rel}' in the schema cache`);
  }
  if (candidates.length > 1) {
    throw new PgError(300, 'PGRST201', `Could not embed because more than one relationship was found for '${table}' and '${rel}'`);
  }
  return candidates[0];
}

/** Parse a PostgREST value list like (a,b,"c,d"). */
function parseList(text) {
  const inner = text.replace(/^\(/, '').replace(/\)$/, '');
  return splitTop(inner).map((v) => v.replace(/^"(.*)"$/, '$1'));
}

/** Compare a stored value with a filter's string value, coercing to the stored type. */
function coerceEq(stored, raw) {
  if (stored === null || stored === undefined) return raw === 'null' ? true : false;
  if (typeof stored === 'number') return stored === Number(raw);
  if (typeof stored === 'boolean') return String(stored) === raw;
  return String(stored) === raw;
}

function compare(stored, raw) {
  if (typeof stored === 'number') return stored - Number(raw);
  const s = String(stored);
  return s < raw ? -1 : s > raw ? 1 : 0;
}

function likeToRegex(pattern, flags) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, flags);
}

/** Build a predicate for one filter expression like "eq.abc", "not.is.null", "in.(a,b)". */
function makePredicate(column, expr) {
  let negate = false;
  let rest = expr;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf('.');
  const op = rest.slice(0, dot);
  const value = rest.slice(dot + 1);
  let test;
  switch (op) {
    case 'eq': test = (row) => coerceEq(row[column], value); break;
    case 'neq': test = (row) => !coerceEq(row[column], value); break;
    case 'gt': test = (row) => row[column] != null && compare(row[column], value) > 0; break;
    case 'gte': test = (row) => row[column] != null && compare(row[column], value) >= 0; break;
    case 'lt': test = (row) => row[column] != null && compare(row[column], value) < 0; break;
    case 'lte': test = (row) => row[column] != null && compare(row[column], value) <= 0; break;
    case 'in': {
      const list = parseList(value);
      test = (row) => list.some((v) => coerceEq(row[column], v));
      break;
    }
    case 'is':
      test = (row) => {
        const v = row[column];
        if (value === 'null') return v === null || v === undefined;
        if (value === 'true') return v === true;
        if (value === 'false') return v === false;
        return false;
      };
      break;
    case 'like': { const re = likeToRegex(value, ''); test = (row) => re.test(String(row[column] ?? '')); break; }
    case 'ilike': { const re = likeToRegex(value, 'i'); test = (row) => re.test(String(row[column] ?? '')); break; }
    case 'cs': {
      const want = value.startsWith('{') ? value.slice(1, -1).split(',') : JSON.parse(value);
      test = (row) => Array.isArray(row[column]) && want.every((w) => row[column].map(String).includes(String(w)));
      break;
    }
    default:
      throw new PgError(400, 'PGRST100', `mock-supabase does not support the "${op}" operator yet`);
  }
  return negate ? (row) => !test(row) : test;
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and']);

/**
 * Read query params into { filters: Map<path, [predicate]>, order, limit, offset }.
 * A path is '' for the top table or 'games' / 'games.rooms' for an embed.
 */
function parseQuery(params) {
  const filters = new Map();
  const add = (path, pred) => {
    if (!filters.has(path)) filters.set(path, []);
    filters.get(path).push(pred);
  };
  for (const [key, value] of params) {
    if (RESERVED.has(key)) {
      if (key === 'or') throw new PgError(400, 'PGRST100', 'mock-supabase does not support or= filters yet');
      continue;
    }
    if (key.endsWith('.order') || key.endsWith('.limit') || key.endsWith('.offset')) continue; // embed modifiers: ignored
    const segments = key.split('.');
    const column = segments.pop();
    add(segments.join('.'), makePredicate(column, value));
  }
  const order = (params.get('order') ?? '')
    .split(',')
    .filter(Boolean)
    .map((term) => {
      const [column, ...mods] = term.split('.');
      return { column, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : null };
    });
  const limit = params.has('limit') ? Number(params.get('limit')) : null;
  const offset = params.has('offset') ? Number(params.get('offset')) : 0;
  return { filters, order, limit, offset };
}

function sortRows(rows, order) {
  if (order.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { column, desc, nullsFirst } of order) {
      const av = a[column];
      const bv = b[column];
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) continue;
        // Postgres default: NULLS LAST for asc, NULLS FIRST for desc.
        const nullsGoFirst = nullsFirst ?? desc;
        return aNull === nullsGoFirst ? -1 : 1;
      }
      let c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0;
      if (desc) c = -c;
      if (c !== 0) return c;
    }
    return 0;
  });
}

/**
 * Shape a row by the select tree, resolving embeds. Returns null when an
 * !inner embed (or a filtered embed under one) has no match, which drops the row.
 */
function project(table, row, nodes, filters, path) {
  const out = {};
  for (const node of nodes) {
    if (node.kind === 'all') {
      Object.assign(out, structuredClone(row));
    } else if (node.kind === 'col') {
      out[node.alias] = structuredClone(row[node.name] ?? null);
    } else {
      const { fk, many } = resolveRelation(table, node.rel, node.hint);
      const childPath = path ? `${path}.${node.rel}` : node.rel;
      const preds = filters.get(childPath) ?? [];
      const target = many ? fk.from : fk.to;
      let related = many
        ? db[target].filter((r) => r[fk.col] === row.id)
        : db[target].filter((r) => r.id === row[fk.col]);
      related = related.filter((r) => preds.every((p) => p(r)));
      const shaped = related
        .map((r) => project(target, r, node.children, filters, childPath))
        .filter((r) => r !== null);
      if (many) {
        if (node.inner && shaped.length === 0) return null;
        out[node.alias] = shaped;
      } else {
        const one = shaped[0] ?? null;
        if (node.inner && one === null) return null;
        out[node.alias] = one;
      }
    }
  }
  return out;
}

function selectRows(table, rows, params) {
  const { filters, order, limit, offset } = parseQuery(params);
  const top = filters.get('') ?? [];
  let matched = rows.filter((r) => top.every((p) => p(r)));
  matched = sortRows(matched, order);
  const nodes = parseSelect(params.get('select'));
  // Embedded filters only constrain the parent when that embed is !inner;
  // project() returns null for those rows.
  let shaped = matched.map((r) => project(table, r, nodes, filters, '')).filter((r) => r !== null);
  const total = shaped.length;
  shaped = shaped.slice(offset, limit === null ? undefined : offset + limit);
  return { rows: shaped, total, offset };
}

function uniqueKey(row, spec) {
  return JSON.stringify(spec.map((part) => (typeof part === 'function' ? part(row) : row[part] ?? null)));
}

function findConflict(table, row, ignoreRow = null) {
  for (const spec of UNIQUES[table] ?? []) {
    const key = uniqueKey(row, spec);
    if (spec.some((part) => typeof part === 'string' && (row[part] === null || row[part] === undefined))) continue;
    const hit = db[table].find((r) => r !== ignoreRow && uniqueKey(r, spec) === key);
    if (hit) return { hit, spec };
  }
  return null;
}

function conflictError(table, spec) {
  const cols = spec.map((p) => (typeof p === 'function' ? 'expr' : p)).join(', ');
  return new PgError(409, '23505', `duplicate key value violates unique constraint "${table}_${cols.replace(/, /g, '_')}_key"`, `Key (${cols}) already exists.`);
}

function parsePrefer(req) {
  const prefer = {};
  for (const part of String(req.headers.prefer ?? '').split(',')) {
    const [k, v] = part.trim().split('=');
    if (k) prefer[k] = v ?? true;
  }
  return prefer;
}

/** Respond with rows, honouring Accept: object (single) and Prefer: return/count. */
function respondRows(req, res, status, table, result, prefer, isWrite) {
  const wantsObject = String(req.headers.accept ?? '').includes('vnd.pgrst.object');
  if (isWrite && prefer.return !== 'representation') {
    return send(req, res, status === 200 ? 204 : status, null);
  }
  const headers = {
    'Content-Range': result.rows.length
      ? `${result.offset}-${result.offset + result.rows.length - 1}/${prefer.count ? result.total : '*'}`
      : `*/${prefer.count ? result.total : '*'}`,
  };
  if (wantsObject) {
    if (result.rows.length !== 1) {
      throw new PgError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${result.rows.length} rows`);
    }
    return send(req, res, status, result.rows[0], headers);
  }
  return send(req, res, status, result.rows, headers);
}

async function handleRest(req, res, url) {
  const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\/?/, ''));
  if (table === '') return send(req, res, 200, { swagger: '2.0', info: { title: 'mock-supabase' } });

  if (table.startsWith('rpc/')) {
    const fn = table.slice(4);
    await readBody(req);
    if (fn === 'generate_claim_code') return send(req, res, 200, claimCode());
    throw new PgError(404, 'PGRST202', `Could not find the function public.${fn} in the schema cache`);
  }

  if (!db[table]) throw new PgError(404, '42P01', `relation "public.${table}" does not exist`);
  const prefer = parsePrefer(req);
  const params = url.searchParams;

  if (req.method === 'GET' || req.method === 'HEAD') {
    return respondRows(req, res, 200, table, selectRows(table, db[table], adopt(table, params)), prefer, false);
  }

  if (req.method === 'POST') {
    const body = parseJson(await readBody(req));
    const incoming = Array.isArray(body) ? body : [body ?? {}];
    const onConflict = params.get('on_conflict')?.split(',');
    const written = [];
    for (const input of incoming) {
      const row = { ...defaults(table), ...input };
      if (table === 'players' && !input.claim_code) row.claim_code = claimCode();
      let existing = null;
      if (onConflict) existing = db[table].find((r) => onConflict.every((c) => coerceEq(r[c], String(row[c]))));
      if (!existing && prefer.resolution) existing = findConflict(table, row)?.hit ?? null;
      if (existing) {
        if (prefer.resolution === 'ignore-duplicates') continue;
        if (prefer.resolution === 'merge-duplicates') {
          Object.assign(existing, input);
          written.push(existing);
          emitChange(table, 'UPDATE', existing, existing);
          continue;
        }
      }
      const conflict = findConflict(table, row);
      if (conflict) throw conflictError(table, conflict.spec);
      db[table].push(row);
      written.push(row);
      emitChange(table, 'INSERT', row, null);
    }
    return respondRows(req, res, 201, table, selectRows(table, written, selectOnly(params)), prefer, true);
  }

  if (req.method === 'PATCH') {
    const patch = parseJson(await readBody(req)) ?? {};
    const { filters } = parseQuery(params);
    const top = filters.get('') ?? [];
    const targets = db[table].filter((r) => top.every((p) => p(r)));
    for (const row of targets) {
      const old = structuredClone(row);
      const next = { ...row, ...patch };
      const conflict = findConflict(table, next, row);
      if (conflict) throw conflictError(table, conflict.spec);
      Object.assign(row, patch);
      if (table === 'players') row.updated_at = new Date().toISOString();
      emitChange(table, 'UPDATE', row, old);
    }
    return respondRows(req, res, 200, table, selectRows(table, targets, selectOnly(params)), prefer, true);
  }

  if (req.method === 'DELETE') {
    const { filters } = parseQuery(params);
    const top = filters.get('') ?? [];
    const targets = db[table].filter((r) => top.every((p) => p(r)));
    const shaped = selectRows(table, targets, selectOnly(params));
    db[table] = db[table].filter((r) => !targets.includes(r));
    // ON DELETE CASCADE / SET NULL, as the migrations declare.
    const ids = new Set(targets.map((r) => r.id));
    if (table === 'library_items') db.library_item_tags = db.library_item_tags.filter((l) => !ids.has(l.item_id));
    if (table === 'tags') {
      db.library_item_tags = db.library_item_tags.filter((l) => !ids.has(l.tag_id));
      for (const item of db.library_items) if (ids.has(item.game_tag_id)) item.game_tag_id = null;
    }
    for (const row of targets) emitChange(table, 'DELETE', null, row);
    return respondRows(req, res, 200, table, shaped, prefer, true);
  }

  throw new PgError(405, 'PGRST000', `mock-supabase does not handle ${req.method} on /rest/v1`);
}

/**
 * Adoption: a players lookup by an unknown browser_id is answered as the
 * MOCK_ADOPT fixture player, so a fresh headless browser opens as Ryann
 * instead of on the name prompt. Returns the (possibly rewritten) params.
 */
function adopt(table, params) {
  if (table !== 'players' || ADOPT === 'none') return params;
  const lookup = params.get('browser_id');
  if (!lookup?.startsWith('eq.')) return params;
  if (db.players.some((p) => p.browser_id === lookup.slice(3))) return params;
  const adopted = db.players.find((p) => p.display_name.toLowerCase() === ADOPT);
  if (!adopted) return params;
  log(`adopt: unknown browser ${lookup.slice(3, 15)}... answered as ${adopted.display_name}`);
  const next = new URLSearchParams(params);
  next.set('browser_id', `eq.${adopted.browser_id}`);
  return next;
}

/** A write's returned rows are shaped by `select` only; its filters already chose them. */
function selectOnly(params) {
  const p = new URLSearchParams();
  if (params.has('select')) p.set('select', params.get('select'));
  return p;
}

// ── Storage ──────────────────────────────────────────────────────────────────

async function handleStorage(req, res, url) {
  const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\//, ''));
  const publicMatch = path.match(/^object\/(?:public|authenticated|sign)\/(.+)$/);
  if (publicMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const obj = storage[publicMatch[1]];
    if (!obj) return send(req, res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return send(req, res, 200, obj.body, { 'Content-Type': obj.contentType, 'Cache-Control': 'no-cache' });
  }
  const objectMatch = path.match(/^object\/([^/]+)(?:\/(.+))?$/);
  if (objectMatch && (req.method === 'POST' || req.method === 'PUT') && objectMatch[2]) {
    const body = await readBody(req);
    const key = `${objectMatch[1]}/${objectMatch[2]}`;
    // supabase-js sends a File/Blob as the raw body (or multipart from Node); the bytes are what matter here.
    storage[key] = { contentType: req.headers['content-type'] ?? 'application/octet-stream', body };
    return send(req, res, 200, { Key: key, Id: randomUUID() });
  }
  if (objectMatch && req.method === 'DELETE' && !objectMatch[2]) {
    const body = parseJson(await readBody(req)) ?? {};
    const removed = (body.prefixes ?? []).map((p) => {
      delete storage[`${objectMatch[1]}/${p}`];
      return { name: p, bucket_id: objectMatch[1] };
    });
    return send(req, res, 200, removed);
  }
  return send(req, res, 404, { statusCode: '404', error: 'not_found', message: `mock storage has no ${req.method} ${path}` });
}

// ── Realtime (Phoenix channels over ws, protocol vsn 2.0.0) ──────────────────

/** topic → Map<socket, { joinRef, selfBroadcast, presenceKey, pgBindings }> */
const topics = new Map();
/** topic → Map<presenceKey, metas[]> */
const presence = new Map();
let pgBindingId = 1000;

function wsSend(socket, joinRef, ref, topic, event, payload) {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify([joinRef, ref, topic, event, payload]));
}

function reply(socket, joinRef, ref, topic, status = 'ok', response = {}) {
  wsSend(socket, joinRef, ref, topic, 'phx_reply', { status, response });
}

/** Fake friends present in a live room, so the lobby and rail look like a real night. */
function friendPresences(topic, exceptPlayerId) {
  if (!FRIENDS_ONLINE) return {};
  const code = topic.replace(/^realtime:room:/, '');
  const room = db.rooms.find((r) => r.join_code === code);
  if (!room || room.status === 'finished') return {};
  const out = {};
  // Only the three fixture friends are faked; Ryann is the one looking (and
  // whoever really joins shows up through their own track()).
  for (const player of db.players) {
    if (![IDS.dan, IDS.jess, IDS.marco].includes(player.id) || player.id === exceptPlayerId) continue;
    out[player.id] = {
      metas: [{
        phx_ref: `fake-${player.id.slice(-4)}`,
        playerId: player.id,
        displayName: player.display_name,
        avatarUrl: player.avatar_url,
        joinedAt: room.created_at,
      }],
    };
  }
  return out;
}

function presenceStateFor(topic, viewerKey) {
  const state = { ...friendPresences(topic, viewerKey) };
  for (const [key, metas] of presence.get(topic) ?? []) state[key] = { metas };
  return state;
}

function broadcastToTopic(topic, fromSocket, event, payload) {
  for (const [socket, member] of topics.get(topic) ?? []) {
    if (socket === fromSocket && !member.selfBroadcast) continue;
    wsSend(socket, null, null, topic, 'broadcast', { type: 'broadcast', event, payload });
  }
}

function presenceDiff(topic, joins, leaves) {
  for (const [socket, member] of topics.get(topic) ?? []) {
    wsSend(socket, member.joinRef, null, topic, 'presence_diff', { joins, leaves });
  }
}

function leaveTopic(socket, topic) {
  const members = topics.get(topic);
  const member = members?.get(socket);
  if (!member) return;
  members.delete(socket);
  if (member.presenceKey && presence.get(topic)?.has(member.presenceKey)) {
    const metas = presence.get(topic).get(member.presenceKey);
    presence.get(topic).delete(member.presenceKey);
    presenceDiff(topic, {}, { [member.presenceKey]: { metas } });
  }
}

/** Decode a vsn 2.0.0 binary user broadcast push (kind 3). */
function decodeBinaryPush(buf) {
  const kind = buf[0];
  if (kind !== 3) return null;
  const [joinRefLen, refLen, topicLen, eventLen, metaLen, encoding] = buf.subarray(1, 7);
  let offset = 7;
  const take = (n) => {
    const s = buf.subarray(offset, offset + n).toString('utf8');
    offset += n;
    return s;
  };
  const joinRef = take(joinRefLen);
  const ref = take(refLen);
  const topic = take(topicLen);
  const event = take(eventLen);
  take(metaLen);
  const rest = buf.subarray(offset);
  const payload = encoding === 1 ? JSON.parse(rest.toString('utf8') || '{}') : rest;
  return { joinRef, ref, topic, event, payload };
}

function handleSocketMessage(socket, data, isBinary) {
  if (isBinary) {
    const msg = decodeBinaryPush(Buffer.from(data));
    if (!msg) return;
    log(`WS  broadcast ${msg.topic} ${msg.event}`);
    broadcastToTopic(msg.topic, socket, msg.event, msg.payload);
    if (msg.ref) reply(socket, msg.joinRef || null, msg.ref, msg.topic);
    return;
  }
  let joinRef, ref, topic, event, payload;
  try {
    [joinRef, ref, topic, event, payload] = JSON.parse(data.toString());
  } catch {
    return;
  }
  if (topic === 'phoenix' && event === 'heartbeat') return reply(socket, null, ref, topic);
  if (event !== 'heartbeat') log(`WS  ${event} ${topic}`);

  if (event === 'phx_join') {
    const config = payload?.config ?? {};
    const pgBindings = (config.postgres_changes ?? []).map((f) => ({ ...f, id: pgBindingId++ }));
    if (!topics.has(topic)) topics.set(topic, new Map());
    if (!presence.has(topic)) presence.set(topic, new Map());
    const presenceKey = config.presence?.key || null;
    topics.get(topic).set(socket, { joinRef, selfBroadcast: !!config.broadcast?.self, presenceKey, pgBindings });
    reply(socket, joinRef, ref, topic, 'ok', { postgres_changes: pgBindings });
    // Phoenix presence needs a full state before it applies diffs.
    wsSend(socket, joinRef, null, topic, 'presence_state', presenceStateFor(topic, presenceKey));
    return;
  }
  if (event === 'phx_leave') {
    leaveTopic(socket, topic);
    return reply(socket, joinRef, ref, topic);
  }
  if (event === 'access_token') return reply(socket, joinRef, ref, topic);
  if (event === 'broadcast') {
    // JSON-encoded broadcast (older path): payload is { type, event, payload }.
    broadcastToTopic(topic, socket, payload?.event, payload?.payload);
    return reply(socket, joinRef, ref, topic);
  }
  if (event === 'presence') {
    const member = topics.get(topic)?.get(socket);
    const key = member?.presenceKey || randomUUID();
    if (member && !member.presenceKey) member.presenceKey = key;
    if (payload?.event === 'track') {
      const metas = [{ phx_ref: randomBytes(6).toString('base64url'), ...(payload.payload ?? {}) }];
      const prev = presence.get(topic)?.get(key);
      presence.get(topic)?.set(key, metas);
      presenceDiff(topic, { [key]: { metas } }, prev ? { [key]: { metas: prev } } : {});
    } else if (payload?.event === 'untrack') {
      const prev = presence.get(topic)?.get(key);
      presence.get(topic)?.delete(key);
      if (prev) presenceDiff(topic, {}, { [key]: { metas: prev } });
    }
    return reply(socket, joinRef, ref, topic);
  }
  return reply(socket, joinRef, ref, topic);
}

/** Send postgres_changes to every channel whose binding matches this write. */
function emitChange(table, type, record, oldRecord) {
  const row = record ?? oldRecord;
  for (const [topic, members] of topics) {
    for (const [socket, member] of members) {
      const ids = member.pgBindings
        .filter((b) => (b.schema ?? 'public') === 'public' && (!b.table || b.table === table))
        .filter((b) => !b.event || b.event === '*' || b.event.toUpperCase() === type)
        .filter((b) => {
          if (!b.filter) return true;
          const m = b.filter.match(/^(\w+)=eq\.(.+)$/);
          return m ? coerceEq(row?.[m[1]], m[2]) : true;
        })
        .map((b) => b.id);
      if (ids.length === 0) continue;
      wsSend(socket, null, null, topic, 'postgres_changes', {
        ids,
        data: {
          schema: 'public',
          table,
          commit_timestamp: new Date().toISOString(),
          type,
          record: record ?? undefined,
          old_record: oldRecord ?? undefined,
          columns: [],
          errors: null,
        },
      });
    }
  }
}

function attachRealtime(server) {
  let WebSocketServer;
  try {
    // `ws` is already in node_modules (a transitive dependency); nothing is installed for this.
    const require = createRequire(import.meta.url);
    ({ WebSocketServer } = require('ws'));
  } catch {
    log('ws not found in node_modules: realtime disabled, rooms will show their reconnecting state');
    server.on('upgrade', (req, socket) => socket.destroy());
    return;
  }
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, BASE_URL);
    if (!url.pathname.startsWith('/realtime/v1/websocket')) return socket.destroy();
    log(`WS  connect ${url.pathname} vsn=${url.searchParams.get('vsn')}`);
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (data, isBinary) => {
        try {
          handleSocketMessage(ws, data, isBinary);
        } catch (err) {
          log(`WS  error ${err.message}`);
        }
      });
      ws.on('close', () => {
        for (const topic of topics.keys()) leaveTopic(ws, topic);
      });
    });
  });
}

// ── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL);
  const started = Date.now();
  res.on('finish', () => {
    const line = `${req.method} ${url.pathname}${url.search}`;
    log(`${line.length > 260 ? `${line.slice(0, 257)}...` : line} -> ${res.statusCode} (${Date.now() - started}ms)`);
  });
  try {
    if (req.method === 'OPTIONS') return send(req, res, 204, null);
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/rest/v1')) return await handleRest(req, res, url);
    if (url.pathname.startsWith('/storage/v1')) return await handleStorage(req, res, url);
    if (url.pathname === '/__mock/reset' && req.method === 'POST') {
      reset();
      return send(req, res, 200, { ok: true });
    }
    if (url.pathname === '/__mock/state') return send(req, res, 200, db);
    if (url.pathname === '/' || url.pathname === '/__mock/health') return send(req, res, 200, { ok: true, name: 'mock-supabase' });
    return send(req, res, 404, { message: `mock-supabase has no route for ${req.method} ${url.pathname}` });
  } catch (err) {
    if (err instanceof PgError) return send(req, res, err.status, err.body);
    log(`ERROR ${err.stack}`);
    return send(req, res, 500, { code: 'MOCK500', message: err.message, details: null, hint: null });
  }
});

attachRealtime(server);
server.listen(PORT, HOST, () => {
  log(`listening on ${BASE_URL} (adopt=${ADOPT}, friendsOnline=${FRIENDS_ONLINE})`);
});
