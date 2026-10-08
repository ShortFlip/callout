'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { playerColor, getInitials } from '@/lib/utils/player-color';
import { discordAvatarUrl, ownStorageUrl } from '@/lib/storage-url';

const SIZE_CLASSES = {
  // Initials follow the 13px floor down to the smallest circle: two capitals
  // at 13px bold are ~17px wide, inside the 24px xs circle.
  xs:  'w-6  h-6  text-[13px]',
  sm:  'w-8  h-8  text-[13px]',
  md:  'w-10 h-10 text-sm',
  lg:  'w-14 h-14 text-base',
  xl:  'w-20 h-20 text-xl',
} as const;

interface PlayerAvatarProps {
  playerId: string;
  displayName: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZE_CLASSES;
  /** Override the derived initials — the game screen uses a single letter. */
  initials?: string;
  className?: string;
}

export function PlayerAvatar({
  playerId,
  displayName,
  avatarUrl,
  size = 'md',
  initials,
  className,
}: PlayerAvatarProps) {
  const sizeClass = SIZE_CLASSES[size];
  // Only our own avatars bucket is drawn (anyone can write avatar_url, and an
  // outside host would see every friend's IP). A blob: URL is the Profile
  // modal's local preview of a file not uploaded yet; it never leaves the tab.
  // A linked player's Discord avatar is the one outside host allowed.
  const src = avatarUrl?.startsWith('blob:')
    ? avatarUrl
    : ownStorageUrl(avatarUrl, 'avatars') ?? discordAvatarUrl(avatarUrl);

  if (src) {
    return (
      <div className={cn('rounded-full overflow-hidden shrink-0', sizeClass, className)}>
        <Image
          src={src}
          alt={displayName}
          width={80}
          height={80}
          className="w-full h-full object-cover"
          unoptimized // Supabase Storage URLs are external; skip Next.js optimization
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white shrink-0',
        sizeClass,
        className,
      )}
      style={{ background: playerColor(playerId) }}
    >
      {initials ?? getInitials(displayName)}
    </div>
  );
}
