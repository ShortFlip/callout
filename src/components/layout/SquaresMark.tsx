import { cn } from '@/lib/utils';

interface SquaresMarkProps {
  /** Rendered edge in px. The mark is square. */
  size: number;
  className?: string;
}

/**
 * The Squares logo: the bare gradient mark with no plate, so it sits on glass
 * and on the page ground alike. One component, so the landing hero, the game
 * header and its skeleton can never drift apart.
 */
export function SquaresMark({ size, className }: SquaresMarkProps) {
  return (
    // A plain img: a static SVG from /public gains nothing from next/image's
    // optimizer, and the Workers deploy has no image loader configured.
    // Decorative: every place it appears has the word "Squares" beside it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/squares-mark.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn('shrink-0 select-none', className)}
      draggable={false}
    />
  );
}
