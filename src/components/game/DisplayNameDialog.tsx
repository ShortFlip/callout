'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DisplayNameDialogProps {
  open: boolean;
  onSubmit: (displayName: string) => Promise<void>;
  /**
   * Discord sign-ins only: connect an existing player by claim code instead of
   * starting a new one. Resolves to an error message, or null when connected.
   */
  onCode?: (code: string) => Promise<string | null>;
}

const MAX_NAME_LENGTH = 20;

/**
 * Shown on first visit — forces the player to pick a display name before
 * they can do anything. Not dismissable (no X, no click-outside).
 */
export function DisplayNameDialog({ open, onSubmit, onCode }: DisplayNameDialogProps) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [codeError, setCodeError] = useState('');

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onCode || code.length !== 8 || isLinking) return;
    setIsLinking(true);
    setCodeError('');
    const message = await onCode(code);
    // On success the provider closes this dialog; only a refusal lands here.
    if (message) setCodeError(message);
    setIsLinking(false);
  }

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      await onSubmit(trimmed);
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }

  // Controlled open + no-op onOpenChange blocks Escape; disablePointerDismissal blocks outside clicks
  return (
    <Dialog open={open} onOpenChange={() => {}} disablePointerDismissal={true}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">What Do We Call You?</DialogTitle>
          <DialogDescription>
            Pick a display name for your friends to see. You can change it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              placeholder="e.g. BingoQueen, DabMaster..."
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              autoComplete="off"
            />
            <div className="flex justify-between text-[13px] text-muted-foreground">
              {error ? (
                <span className="text-destructive">{error}</span>
              ) : (
                <span>{trimmed.length === 0 ? 'Required' : ' '}</span>
              )}
              <span>{name.length}/{MAX_NAME_LENGTH}</span>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? "Let's Go…" : "Let's Play"}
          </Button>
        </form>

        {onCode && (
          <form onSubmit={handleCodeSubmit} className="pt-3 border-t border-border space-y-2">
            <Label htmlFor="link-code">Played Before? Use Your Claim Code</Label>
            <div className="flex items-center gap-2">
              <Input
                id="link-code"
                value={code}
                // Same normalization as the profile's claim input: uppercase,
                // and drop characters the code alphabet never produces.
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8));
                  setCodeError('');
                }}
                placeholder="XXXXXXXX"
                className="font-mono tracking-[0.12em] uppercase"
                maxLength={8}
                autoComplete="off"
              />
              <Button type="submit" variant="outline" disabled={code.length !== 8 || isLinking}>
                {isLinking ? 'Connecting…' : 'Connect'}
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {codeError
                ? <span className="text-destructive">{codeError}</span>
                : 'Your old PC shows it under Profile. Keeps your stats.'}
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
