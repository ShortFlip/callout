'use client';

import { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPage } from '@/components/layout/StatusPage';
import { signInWithDiscord } from '@/lib/auth/sign-in';

/**
 * The whole app until you sign in with Discord.
 *
 * Why it replaces the page instead of offering anonymous play: every anonymous
 * visit used to mint a players row, and a new PC or cleared cache split
 * someone's stats across rows (five for Ryann by the rename). With the login
 * as the only way in, a player exists only once (decision 0007).
 */
export function SignInWall() {
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleSignIn() {
    setIsSigningIn(true);
    await signInWithDiscord();
    // Only a failure gets here; success has already left for Discord.
    setIsSigningIn(false);
  }

  return (
    <StatusPage
      pill="Sign In"
      tone="primary"
      title="Sign In To Play"
      actions={
        <Button size="lg" className="w-full" onClick={handleSignIn} disabled={isSigningIn}>
          {isSigningIn
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <LogIn className="w-4 h-4 mr-2" strokeWidth={1.75} />}
          Sign in with Discord
        </Button>
      }
    >
      Callout knows you by your Discord login, so you are the same player on every PC.
    </StatusPage>
  );
}
