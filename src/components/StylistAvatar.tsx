import { useState } from 'react';

interface StylistAvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StylistAvatar({ src, name, size = 'md' }: StylistAvatarProps) {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm'
      ? 'h-8 w-8 text-xs'
      : size === 'lg'
        ? 'h-12 w-12 text-sm'
        : 'h-10 w-10 text-xs';

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (!src || failed) {
    return (
      <div
        className={`${dims} shrink-0 rounded-lg bg-[#EDE9FE] text-[#6D28D9] font-semibold flex items-center justify-center border border-[#DDD6FE]`}
        aria-label={name}
      >
        {initials || 'SP'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dims} shrink-0 rounded-lg object-cover border border-[#E5E7EB] bg-[#F3F4F6]`}
    />
  );
}
