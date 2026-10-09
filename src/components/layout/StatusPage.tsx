import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PILL } from '@/lib/pill';

interface StatusPageProps {
  /** The pill's word: "Offline", "No Room", "Error". */
  pill: string;
  /**
   * Amber for "something went wrong, try again"; rose for "that does not
   * exist"; violet for the sign-in card, which is a way in, not a dead end.
   */
  tone: 'accent' | 'destructive' | 'primary';
  title: string;
  /** One or two sentences, sentence case. */
  children: ReactNode;
  /** The card's buttons, full width under the copy. */
  actions: ReactNode;
}

/**
 * The whole-page states: Can't Reach The Server, No Room With That Code and
 * Something Broke. One glass card in the middle of the ground, so every dead
 * end in the app looks the same and always has a way out.
 */
export function StatusPage({ pill, tone, title, children, actions }: StatusPageProps) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="glass rounded-2xl w-full max-w-sm p-8 text-center space-y-4">
        {/* A tinted pill: the colour says which kind of dead end before the words do. */}
        <span
          className={cn(PILL, { accent: 'text-accent', destructive: 'text-destructive', primary: 'text-primary' }[tone])}
          style={{ backgroundColor: `color-mix(in oklab, var(--${tone}) 14%, transparent)` }}
        >
          {pill}
        </span>
        <h1 className="font-display text-2xl font-black">{title}</h1>
        <p className="text-sm text-muted-foreground">{children}</p>
        {actions}
      </div>
    </main>
  );
}
