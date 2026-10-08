'use client';

import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FULL_COLOUR_TAG } from '@/lib/library/logo-image';
import { cn } from '@/lib/utils';
import { ownStorageUrl } from '@/lib/storage-url';

interface GameMarkProps {
  /** The lookalike icon, drawn when there is no logo. */
  icon: LucideIcon;
  /** CSS colour for the icon. A logo carries its own colours. */
  color?: string;
  /** An uploaded logo; null or undefined draws the icon. */
  logoUrl?: string | null;
  /** Classes that size the mark (size-4, size-3.5…) and place it. */
  className?: string;
  style?: CSSProperties;
  /**
   * Draw a logo a notch larger than its box (1.25x) without moving anything:
   * at 16px a picture-like logo is mush, at 20px it holds. Library rows and
   * chips only; the board's corner marker sits 1px above the square's text
   * on the smallest boards, so it never grows.
   */
  grow?: boolean;
}

/**
 * One game's mark: its uploaded logo when it has one, else its icon in its
 * colour. Every surface that shows a game (library rows, chips, the board's
 * corner marker, the legend) draws through this, so a logo appears everywhere
 * at once.
 *
 * A one-colour logo (his MW wordmark and RL car are white) is drawn as a
 * silhouette in the game's colour, the way the icons were: white-on-white
 * vanished on Classic's white squares ("I have to click on them for it to
 * show"), and orange vs blue is what tells MW from RL at a glance. It is a
 * CSS mask, so the bucket's open CORS (Access-Control-Allow-Origin: *) is
 * what lets it load. Only a logo uploaded as full colour (URL tagged #color
 * by isFullColour at upload) keeps its own pixels.
 */
export function GameMark({ icon: Icon, color, logoUrl: rawLogoUrl, className, style, grow = false }: GameMarkProps) {
  // Checked here too, not only in the legend: library rows pass tags.logo_url
  // straight in, and this is the one place every logo is drawn.
  const logoUrl = ownStorageUrl(rawLogoUrl, 'game-logos');
  if (logoUrl && !logoUrl.endsWith(FULL_COLOUR_TAG)) {
    const mask = `url("${logoUrl}") center / contain no-repeat`;
    return (
      <span
        aria-hidden
        data-logo={logoUrl}
        className={cn('inline-block shrink-0', grow && 'scale-125', className)}
        style={{ backgroundColor: color ?? 'currentColor', mask, WebkitMask: mask, ...style }}
      />
    );
  }
  if (logoUrl) {
    return (
      // A plain img: logos are 128px PNGs from Supabase Storage, and next/image's
      // optimiser would need the bucket host allow-listed for no real gain.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        draggable={false}
        className={cn('shrink-0 object-contain', grow && 'scale-125', className)}
        style={style}
      />
    );
  }
  return <Icon aria-hidden strokeWidth={1.75} className={cn('shrink-0', className)} style={{ color, ...style }} />;
}
