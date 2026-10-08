import { afterEach, describe, expect, it, vi } from 'vitest';
import { avatarPath, gameLogoPath, ownStorageUrl } from '@/lib/storage-url';

const BASE = 'https://abc.supabase.co';
const MOCK = 'http://127.0.0.1:54399';

describe('ownStorageUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts a public object in the named bucket, query and fragment included', () => {
    const avatar = `${BASE}/storage/v1/object/public/avatars/p1/avatar?t=1759500000000`;
    expect(ownStorageUrl(avatar, 'avatars', BASE)).toBe(avatar);
    const logo = `${BASE}/storage/v1/object/public/game-logos/p1/t1.png?t=1#color`;
    expect(ownStorageUrl(logo, 'game-logos', BASE)).toBe(logo);
  });

  it('still accepts the old flat paths (uploaded before owner folders)', () => {
    const flat = `${BASE}/storage/v1/object/public/game-logos/t1.png?t=1`;
    expect(ownStorageUrl(flat, 'game-logos', BASE)).toBe(flat);
  });

  it('refuses another host, including one that only starts with ours', () => {
    expect(ownStorageUrl('https://evil.example/storage/v1/object/public/avatars/x.png', 'avatars', BASE)).toBeNull();
    expect(ownStorageUrl('https://abc.supabase.co.evil.example/storage/v1/object/public/avatars/x.png', 'avatars', BASE)).toBeNull();
    expect(ownStorageUrl(`http://abc.supabase.co/storage/v1/object/public/avatars/x.png`, 'avatars', BASE)).toBeNull();
  });

  it('refuses the wrong bucket, a non-public path and a path that climbs out', () => {
    expect(ownStorageUrl(`${BASE}/storage/v1/object/public/game-logos/x.png`, 'avatars', BASE)).toBeNull();
    expect(ownStorageUrl(`${BASE}/storage/v1/object/sign/avatars/x.png`, 'avatars', BASE)).toBeNull();
    expect(ownStorageUrl(`${BASE}/storage/v1/object/public/avatars/../../../rest/v1/players`, 'avatars', BASE)).toBeNull();
    expect(ownStorageUrl(`${BASE}/storage/v1/object/public/avatarsX/x.png`, 'avatars', BASE)).toBeNull();
  });

  it('refuses anything that is not a URL string, and everything when no project URL is set', () => {
    expect(ownStorageUrl(null, 'avatars', BASE)).toBeNull();
    expect(ownStorageUrl(42, 'avatars', BASE)).toBeNull();
    expect(ownStorageUrl('not a url', 'avatars', BASE)).toBeNull();
    expect(ownStorageUrl('javascript:alert(1)', 'avatars', BASE)).toBeNull();
    expect(ownStorageUrl(`${BASE}/storage/v1/object/public/avatars/x.png`, 'avatars', '')).toBeNull();
  });

  it('defaults to NEXT_PUBLIC_SUPABASE_URL, so the dev:mock origin passes', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', MOCK);
    const mockAvatar = `${MOCK}/storage/v1/object/public/avatars/p1.png`;
    expect(ownStorageUrl(mockAvatar, 'avatars')).toBe(mockAvatar);
    expect(ownStorageUrl(`${BASE}/storage/v1/object/public/avatars/p1.png`, 'avatars')).toBeNull();
  });
});

describe('storage paths', () => {
  it('puts each file under its owner player id, the folder the policy checks', () => {
    expect(avatarPath('p1')).toBe('p1/avatar');
    expect(gameLogoPath('p1', 't1')).toBe('p1/t1.png');
  });
});
