// Isometric "cube" mark inspired by the app icon (orange outline on charcoal).
export default function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="logo">
      <rect width="64" height="64" rx="14" fill="#2b2d33" />
      <path d="M32 9 L53 21 V43 L32 55 L11 43 V21 Z" fill="none" stroke="#f26b3a" strokeWidth="6" strokeLinejoin="round" />
      <path d="M20 26 V39 L32 46" fill="none" stroke="#f26b3a" strokeWidth="6" strokeLinejoin="round" />
      <path d="M44 26 L36 30.5" fill="none" stroke="#f26b3a" strokeWidth="6" strokeLinecap="round" />
      <path d="M38 34 V42" stroke="#6b6f78" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
