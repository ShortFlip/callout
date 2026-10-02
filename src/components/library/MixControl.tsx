'use client';

import { AlertCircle } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { splitFromPercent, type LaneKey } from '@/lib/game/card-builder';
import { rebalanceLanes } from '@/lib/library/card-draft';
import { GAME_COLORS } from '@/lib/game-colors';
import { GameGlyph } from './GameGlyph';
import type { MixLane, Tag } from '@/types/library';

interface MixControlProps {
  /** The lanes on offer: games with items (tag order), then No Game. */
  lanes: LaneKey[];
  games: Tag[];
  /** Squares per lane on the card right now: the real split, pins included. */
  counts: Map<LaneKey, number>;
  /** Items per lane in the pool, for the "Only 4" caps and the rebalance. */
  available: Map<LaneKey, number>;
  /** Lanes the last build could not fill as asked. */
  capped: LaneKey[];
  /** Slots the mix shares out (a text-only square takes its slot first). */
  slots: number;
  onChange: (lanes: MixLane[]) => void;
}

/** A lane's colour for its slider fill; No Game is the quiet muted tone. */
function laneColor(game: Tag | undefined): string {
  return game?.color ? GAME_COLORS[game.color] : 'var(--muted-foreground)';
}

/**
 * The mix, inside the Fill Empty menu: how the empty squares split across
 * games. `slots` is the empty squares and `counts` is what Fill would draw
 * per game, so the sliders preview exactly what the next Fill adds, capped at
 * the items each game has left.
 *
 * Two lanes: ONE split slider, left game ◀─●─▶ right game, stepping one square
 * at a time via splitFromPercent. Three or more: one slider per lane, and
 * moving one shares the rest across the others (rebalanceLanes).
 */
export function MixControl({ lanes, games, counts, available, capped, slots, onChange }: MixControlProps) {
  const gameOf = (lane: LaneKey) => (lane ? games.find((g) => g.id === lane) : undefined);
  const nameOf = (lane: LaneKey) => (lane ? gameOf(lane)?.name ?? 'Unknown Game' : 'No Game');
  const countOf = (lane: LaneKey) => counts.get(lane) ?? 0;
  const pct = (n: number) => (slots > 0 ? Math.round((n / slots) * 100) : 0);

  const words = lanes
    .filter((lane) => countOf(lane) > 0)
    .map((lane) => ({ lane, n: countOf(lane) }));

  // A capped lane only matters when the other lanes can't make up the gap; with
  // every square filled, "Only 7" is noise.
  const filled = lanes.reduce((sum, lane) => sum + countOf(lane), 0);
  const cappedNotes = filled >= slots ? [] : lanes
    .filter((lane) => capped.includes(lane))
    .map((lane) => `Only ${available.get(lane) ?? 0} ${nameOf(lane)} ${(available.get(lane) ?? 0) === 1 ? 'Item' : 'Items'}`);

  return (
    <div className="space-y-2" data-testid="mix">
      <p className="text-[13px] font-medium text-muted-foreground">Fill Empty Squares From</p>

      {lanes.length === 0 && (
        <p className="text-[13px] text-muted-foreground">Import items to fill the card.</p>
      )}

      {lanes.length === 2 && (() => {
        const [left, right] = lanes;
        const a = countOf(left);
        const b = countOf(right);
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <GameGlyph game={gameOf(left)} />
                <span className="truncate">{nameOf(left)}</span>
                <span className="font-mono text-[13px] text-muted-foreground">{pct(a)}%</span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="font-mono text-[13px] text-muted-foreground">{pct(b)}%</span>
                <span className="truncate">{nameOf(right)}</span>
                <GameGlyph game={gameOf(right)} />
              </span>
            </div>
            <Slider
              value={[slots > 0 ? (a / slots) * 100 : 0]}
              min={0}
              max={100}
              // One square per step, so arrow keys and drags both land on whole squares.
              step={slots > 0 ? 100 / slots : 1}
              disabled={slots === 0}
              thumbLabel={`${nameOf(left)} Share`}
              thumbValueText={() => `${a} ${nameOf(left)}, ${b} ${nameOf(right)}`}
              trackStyle={{ backgroundColor: `color-mix(in oklab, ${laneColor(gameOf(right))} 55%, transparent)` }}
              indicatorStyle={{ backgroundColor: laneColor(gameOf(left)) }}
              onValueChange={(value) => {
                const percent = Array.isArray(value) ? value[0] : value;
                const [x, y] = splitFromPercent(percent, slots);
                if (x !== a || y !== b) {
                  onChange([
                    { gameTagId: left, count: x },
                    { gameTagId: right, count: y },
                  ]);
                }
              }}
            />
          </div>
        );
      })()}

      {lanes.length >= 3 && (
        <div className="space-y-1">
          {lanes.map((lane, index) => (
            <div key={lane ?? 'none'} className="flex items-center gap-3" data-lane={nameOf(lane)}>
              <span className="flex w-36 min-w-0 shrink-0 items-center gap-1.5 text-sm">
                <GameGlyph game={gameOf(lane)} />
                <span className="truncate">{nameOf(lane)}</span>
              </span>
              <Slider
                value={[countOf(lane)]}
                min={0}
                max={Math.max(1, slots)}
                step={1}
                disabled={slots === 0}
                thumbLabel={`${nameOf(lane)} Squares`}
                thumbValueText={(value) => `${value} ${nameOf(lane)}`}
                indicatorStyle={{ backgroundColor: laneColor(gameOf(lane)) }}
                onValueChange={(value) => {
                  const n = Array.isArray(value) ? value[0] : value;
                  if (n === countOf(lane)) return;
                  const current = lanes.map((l) => ({ gameTagId: l, count: countOf(l) }));
                  onChange(rebalanceLanes(current, index, n, slots, available));
                }}
              />
              <span className="w-7 shrink-0 text-right font-mono text-[13px]">{countOf(lane)}</span>
            </div>
          ))}
        </div>
      )}

      {lanes.length > 0 && (
        <p className="text-[13px] text-muted-foreground" data-testid="mix-words">
          {words.length === 0
            ? 'No Empty Squares To Fill'
            : words.map(({ lane, n }, i) => (
                <span key={lane ?? 'none'}>
                  {i > 0 && ' · '}
                  <span className="font-mono text-foreground">{n}</span> {nameOf(lane)}
                </span>
              ))}
        </p>
      )}

      {cappedNotes.map((note) => (
        <p key={note} className="flex items-center gap-1.5 text-[13px] text-foreground/85" data-testid="mix-capped">
          <AlertCircle className="size-4 text-accent" strokeWidth={1.75} />
          {note}
        </p>
      ))}
    </div>
  );
}
