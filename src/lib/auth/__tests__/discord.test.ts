import { describe, it, expect } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { discordProfile, takeOAuthError } from '../discord';

// Only the fields discordProfile reads; the rest of User is irrelevant here.
function user(fields: Partial<User>): User {
  return { id: 'u1', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '', ...fields } as User;
}

describe('discordProfile', () => {
  it('is null for an anonymous session', () => {
    expect(discordProfile(user({ is_anonymous: true }))).toBeNull();
    expect(discordProfile(null)).toBeNull();
  });

  it('is null for a non-Discord login', () => {
    expect(discordProfile(user({ is_anonymous: false, app_metadata: { provider: 'email' } }))).toBeNull();
  });

  it('prefers the Discord display name and keeps the avatar', () => {
    const p = discordProfile(user({
      is_anonymous: false,
      app_metadata: { provider: 'discord', providers: ['discord'] },
      user_metadata: {
        custom_claims: { global_name: 'Shorty' },
        full_name: 'shortflip#0',
        avatar_url: 'https://cdn.discordapp.com/avatars/1/a.png',
      },
    }));
    expect(p).toEqual({ name: 'Shorty', avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png' });
  });

  it('falls back to the username without the #0 discriminator, and no avatar', () => {
    const p = discordProfile(user({
      is_anonymous: false,
      app_metadata: { provider: 'anonymous', providers: ['anonymous', 'discord'] },
      user_metadata: { full_name: 'shortflip#0' },
    }));
    expect(p).toEqual({ name: 'shortflip', avatarUrl: null });
  });
});

describe('takeOAuthError', () => {
  it('is null when the URL carries no error', () => {
    expect(takeOAuthError(new URL('https://x.test/library?card=1'))).toBeNull();
  });

  it('reads a query error and strips only the error params', () => {
    const r = takeOAuthError(new URL(
      'https://x.test/?card=1&error=access_denied&error_code=403&error_description=The+user+denied',
    ));
    expect(r).toEqual({ message: 'The user denied', cleaned: 'https://x.test/?card=1' });
  });

  it('reads a hash error', () => {
    const r = takeOAuthError(new URL('https://x.test/#error=server_error&error_description=Bad%20secret'));
    expect(r).toEqual({ message: 'Bad secret', cleaned: 'https://x.test/' });
  });
});
