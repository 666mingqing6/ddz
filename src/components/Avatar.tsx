import type { ReactNode } from 'react';

/**
 * 统一头像：8 个内联 SVG 形象。
 * 兼容历史数据中的 emoji 头像（旧账号），渲染时自动映射，不破坏已有用户。
 */

export const AVATAR_IDS = ['tiger', 'panda', 'fox', 'dog', 'pig', 'frog', 'rabbit', 'bear'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

const EMOJI_MAP: Record<string, AvatarId> = {
  '🐯': 'tiger',
  '🐼': 'panda',
  '🦊': 'fox',
  '🐵': 'fox',
  '🐶': 'dog',
  '🐷': 'pig',
  '🐸': 'frog',
  '🐰': 'rabbit',
  '🐨': 'bear',
  '🐻': 'bear',
  '🦁': 'tiger',
  '🐮': 'pig',
};

export function normalizeAvatar(value: string | null | undefined): AvatarId {
  if (!value) return 'panda';
  if ((AVATAR_IDS as readonly string[]).includes(value)) return value as AvatarId;
  const mapped = EMOJI_MAP[value];
  if (mapped) return mapped;
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 9973;
  return AVATAR_IDS[hash % AVATAR_IDS.length];
}

const FACES: Record<AvatarId, ReactNode> = {
  tiger: (
    <>
      <circle cx="24" cy="24" r="23" fill="#f4a93f" />
      <circle cx="12.5" cy="13" r="6.2" fill="#e0892a" />
      <circle cx="35.5" cy="13" r="6.2" fill="#e0892a" />
      <circle cx="12.5" cy="13" r="3.2" fill="#ffd9a0" />
      <circle cx="35.5" cy="13" r="3.2" fill="#ffd9a0" />
      <circle cx="24" cy="26" r="15.5" fill="#fbc76d" />
      <path d="M24 11.5v5M17 13.5l1.6 4.2M31 13.5l-1.6 4.2" stroke="#c9751f" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M11.5 27h4M32.5 27h4M11.8 33l3.6-1M36.2 33l-3.6-1" stroke="#c9751f" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="24" cy="32.5" rx="8.6" ry="6.4" fill="#fff7ea" />
      <circle cx="19" cy="24.5" r="1.9" fill="#3b2513" />
      <circle cx="29" cy="24.5" r="1.9" fill="#3b2513" />
      <path d="M21.4 29.2h5.2L24 32z" fill="#3b2513" />
      <path d="M24 32.2v1.6M24 33.8c-.9 1.1-2.4 1.1-3.2 0M24 33.8c.9 1.1 2.4 1.1 3.2 0" stroke="#8a5a2b" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
  panda: (
    <>
      <circle cx="24" cy="24" r="23" fill="#e9f0e6" />
      <circle cx="12.5" cy="13.5" r="6.4" fill="#2b2f33" />
      <circle cx="35.5" cy="13.5" r="6.4" fill="#2b2f33" />
      <circle cx="24" cy="26" r="15.8" fill="#fdfefb" />
      <ellipse cx="18.4" cy="23.6" rx="4.3" ry="5.4" fill="#2b2f33" transform="rotate(-16 18.4 23.6)" />
      <ellipse cx="29.6" cy="23.6" rx="4.3" ry="5.4" fill="#2b2f33" transform="rotate(16 29.6 23.6)" />
      <circle cx="18.8" cy="23.4" r="1.7" fill="#fff" />
      <circle cx="29.2" cy="23.4" r="1.7" fill="#fff" />
      <ellipse cx="24" cy="31.4" rx="2.1" ry="1.5" fill="#2b2f33" />
      <path d="M24 32.6v1.4M24 34c-.8 1-2.2 1-3 0M24 34c.8 1 2.2 1 3 0" stroke="#5c6469" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
  fox: (
    <>
      <circle cx="24" cy="24" r="23" fill="#ef8a4d" />
      <path d="M9.5 19 12.5 6.5 21 14.5z" fill="#e0713a" />
      <path d="M38.5 19 35.5 6.5 27 14.5z" fill="#e0713a" />
      <path d="M12.5 16.5 13.8 10l4.4 4z" fill="#ffd2b0" />
      <path d="M35.5 16.5 34.2 10l-4.4 4z" fill="#ffd2b0" />
      <circle cx="24" cy="26.5" r="15.2" fill="#f9a26c" />
      <path d="M24 24c5 0 8.6 3.4 8.6 7.4 0 4.4-4 7.2-8.6 7.2s-8.6-2.8-8.6-7.2c0-4 3.6-7.4 8.6-7.4Z" fill="#fff3e6" />
      <circle cx="18.8" cy="23.6" r="1.9" fill="#3b2513" />
      <circle cx="29.2" cy="23.6" r="1.9" fill="#3b2513" />
      <path d="M22 29.4h4L24 32z" fill="#3b2513" />
    </>
  ),
  dog: (
    <>
      <circle cx="24" cy="24" r="23" fill="#c99b6a" />
      <ellipse cx="10.5" cy="24" rx="5.4" ry="9" fill="#8f6440" transform="rotate(12 10.5 24)" />
      <ellipse cx="37.5" cy="24" rx="5.4" ry="9" fill="#8f6440" transform="rotate(-12 37.5 24)" />
      <circle cx="24" cy="25.5" r="15.4" fill="#e3bb8b" />
      <ellipse cx="24" cy="32.5" rx="9" ry="6.6" fill="#f7e6cd" />
      <circle cx="19" cy="23" r="2" fill="#3b2513" />
      <circle cx="29" cy="23" r="2" fill="#3b2513" />
      <ellipse cx="24" cy="29.4" rx="2.6" ry="2" fill="#3b2513" />
      <path d="M24 31.4v1.8M24 33.2c-.9 1.2-2.5 1.2-3.3 0M24 33.2c.9 1.2 2.5 1.2 3.3 0" stroke="#8a5a2b" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M20 35.6c1.4 1.6 6.6 1.6 8 0" stroke="#d2685f" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
  pig: (
    <>
      <circle cx="24" cy="24" r="23" fill="#f5a8bd" />
      <path d="M11 15.5 13.5 8l6 4.5z" fill="#e886a1" />
      <path d="M37 15.5 34.5 8l-6 4.5z" fill="#e886a1" />
      <circle cx="24" cy="26" r="15.4" fill="#fbc4d3" />
      <ellipse cx="24" cy="31.5" rx="7.4" ry="5.6" fill="#f095b0" />
      <ellipse cx="21" cy="31.5" rx="1.3" ry="1.8" fill="#a8455f" />
      <ellipse cx="27" cy="31.5" rx="1.3" ry="1.8" fill="#a8455f" />
      <circle cx="18.4" cy="23" r="1.9" fill="#3b2513" />
      <circle cx="29.6" cy="23" r="1.9" fill="#3b2513" />
    </>
  ),
  frog: (
    <>
      <circle cx="24" cy="24" r="23" fill="#8ac97c" />
      <circle cx="15.5" cy="14.5" r="7.2" fill="#f4fbf1" />
      <circle cx="32.5" cy="14.5" r="7.2" fill="#f4fbf1" />
      <circle cx="15.5" cy="15" r="3.4" fill="#2f3a2c" />
      <circle cx="32.5" cy="15" r="3.4" fill="#2f3a2c" />
      <circle cx="14.6" cy="13.9" r="1.2" fill="#fff" />
      <circle cx="31.6" cy="13.9" r="1.2" fill="#fff" />
      <circle cx="24" cy="27" r="14.6" fill="#a9dc99" />
      <path d="M16 31c2.4 3.2 13.6 3.2 16 0" stroke="#4e7a44" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <circle cx="18.6" cy="24" r="1.5" fill="#4e7a44" />
      <circle cx="29.4" cy="24" r="1.5" fill="#4e7a44" />
    </>
  ),
  rabbit: (
    <>
      <circle cx="24" cy="24" r="23" fill="#e7e9f2" />
      <ellipse cx="16.5" cy="11" rx="4.2" ry="9" fill="#f7f8fc" transform="rotate(-10 16.5 11)" />
      <ellipse cx="31.5" cy="11" rx="4.2" ry="9" fill="#f7f8fc" transform="rotate(10 31.5 11)" />
      <ellipse cx="16.5" cy="11" rx="2" ry="6" fill="#f2bcc9" transform="rotate(-10 16.5 11)" />
      <ellipse cx="31.5" cy="11" rx="2" ry="6" fill="#f2bcc9" transform="rotate(10 31.5 11)" />
      <circle cx="24" cy="27.5" r="14.4" fill="#fbfcff" />
      <circle cx="19" cy="25.5" r="1.9" fill="#3b2513" />
      <circle cx="29" cy="25.5" r="1.9" fill="#3b2513" />
      <ellipse cx="24" cy="30.4" rx="1.9" ry="1.4" fill="#e08a9c" />
      <path d="M24 31.6v1.4M24 33c-.8 1-2.2 1-3 0M24 33c.8 1 2.2 1 3 0" stroke="#b9a0a8" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
  bear: (
    <>
      <circle cx="24" cy="24" r="23" fill="#a8815c" />
      <circle cx="12.5" cy="13.5" r="6.6" fill="#8d6949" />
      <circle cx="35.5" cy="13.5" r="6.6" fill="#8d6949" />
      <circle cx="12.5" cy="13.5" r="3.4" fill="#c9a17a" />
      <circle cx="35.5" cy="13.5" r="3.4" fill="#c9a17a" />
      <circle cx="24" cy="26" r="15.4" fill="#c39a72" />
      <ellipse cx="24" cy="32" rx="8.2" ry="6.2" fill="#e8d3b8" />
      <circle cx="19" cy="23.4" r="1.9" fill="#33220f" />
      <circle cx="29" cy="23.4" r="1.9" fill="#33220f" />
      <ellipse cx="24" cy="29.2" rx="2.4" ry="1.9" fill="#33220f" />
      <path d="M24 31v1.5M24 32.5c-.9 1.1-2.4 1.1-3.2 0M24 32.5c.9 1.1 2.4 1.1 3.2 0" stroke="#8a5a2b" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
};

interface Props {
  id: string | null | undefined;
  size?: number;
  className?: string;
  ring?: boolean;
}

export function Avatar({ id, size = 40, className = '', ring }: Props) {
  const key = normalizeAvatar(id);
  return (
    <svg
      className={`avatar-svg ${ring ? 'has-ring' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      {FACES[key]}
    </svg>
  );
}
