import React from 'react';

/**
 * Brand marks for the Varietal Planning System.
 *
 * The greens (#059669 / #10b981 / #34d399) are deliberately the same values as
 * --accent in light and dark mode, so the marks sit naturally on either theme.
 *
 * The NEUTRALS are the one thing that had to change from the source artwork:
 * the originals hardcoded near-black (#0f172a) and near-white (#f8fafc/white),
 * which vanish when the theme flips. Those now reference --text-primary and
 * --surface-card so they invert with everything else.
 */

interface LogoProps {
  className?: string;
  title?: string;
}

/** Cane stalk beside a rising bar chart. The primary mark - used in the header. */
export const DataSproutLogo: React.FC<LogoProps> = ({ className = 'w-10 h-10', title }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role={title ? 'img' : 'presentation'}
    aria-label={title}
  >
    {title && <title>{title}</title>}
    {/* rising bars */}
    <rect x="45" y="55" width="12" height="25" rx="2" fill="#34d399" opacity="0.4" />
    <rect x="62" y="40" width="12" height="40" rx="2" fill="#10b981" opacity="0.7" />
    <rect x="79" y="20" width="12" height="60" rx="2" fill="#059669" />
    {/* cane stalk nodes */}
    <rect x="18" y="15" width="14" height="26" rx="4" fill="#059669" />
    <rect x="18" y="44" width="14" height="36" rx="4" fill="#059669" />
    {/* leaves */}
    <path d="M 18 25 Q 5 20 5 5 Q 15 10 25 15 Z" fill="#10b981" />
    <path d="M 32 50 Q 45 40 55 25 Q 45 50 32 60 Z" fill="#10b981" />
  </svg>
);

/** Hexagonal field map with plough lines. Suits land / survey / allocation contexts. */
export const CommandAreaLogo: React.FC<LogoProps> = ({ className = 'w-10 h-10', title }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role={title ? 'img' : 'presentation'}
    aria-label={title}
  >
    {title && <title>{title}</title>}
    <polygon
      points="50,10 85,30 85,75 50,95 15,75 15,30"
      stroke="var(--text-primary)"
      strokeWidth="6"
      strokeLinejoin="round"
      fill="var(--surface-card)"
    />
    <line x1="35" y1="20" x2="35" y2="85" stroke="#10b981" strokeWidth="5" strokeLinecap="round" />
    <line x1="50" y1="10" x2="50" y2="95" stroke="#059669" strokeWidth="5" strokeLinecap="round" />
    <line x1="65" y1="20" x2="65" y2="85" stroke="#10b981" strokeWidth="5" strokeLinecap="round" />
    <path d="M 65 30 Q 95 15 95 0 Q 75 10 50 30 Z" fill="#059669" />
  </svg>
);

/** Monogram G with a cane-node gap. Compact mark for favicons and tight spaces. */
export const MinimalGLogo: React.FC<LogoProps> = ({ className = 'w-10 h-10', title }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role={title ? 'img' : 'presentation'}
    aria-label={title}
  >
    {title && <title>{title}</title>}
    <path
      d="M 85 35 A 40 40 0 1 0 50 90 A 40 40 0 0 0 90 55 L 50 55"
      stroke="#059669"
      strokeWidth="14"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* the "gap" must be the surface colour, not literal white, or it shows as a
        bright line on a dark card instead of reading as a cut */}
    <line x1="45" y1="55" x2="95" y2="55" stroke="var(--surface-card)" strokeWidth="4" />
    <path d="M 50 55 Q 75 35 95 35 Q 85 55 50 55 Z" fill="#10b981" />
  </svg>
);

/** Two leaves chasing each other around a node - the plant/ratoon cycle. */
export const RatoonCycleLogo: React.FC<LogoProps> = ({ className = 'w-10 h-10', title }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role={title ? 'img' : 'presentation'}
    aria-label={title}
  >
    {title && <title>{title}</title>}
    <path d="M 25 75 C 5 45 40 10 85 10 C 60 25 50 50 65 80 C 40 70 30 80 25 75 Z" fill="#059669" />
    <path
      d="M 75 25 C 95 55 60 90 15 90 C 40 75 50 50 35 20 C 60 30 70 20 75 25 Z"
      fill="#10b981"
      opacity="0.9"
    />
    <circle cx="50" cy="50" r="8" fill="var(--text-primary)" />
  </svg>
);

/**
 * Magnifier over data tiles, wordmark above and below. The primary app mark.
 *
 * Neutrals follow this file's rule: the source artwork's #0f172a and white are
 * swapped for --text-primary and --surface-card so the mark survives a theme
 * flip. The greens, lime and amber are brand values and are left untouched.
 *
 * Note the wordmark is part of the artwork, so this needs roughly 56px before
 * "varietal" and "data" become legible.
 */
export const VarietalDataLogo: React.FC<LogoProps> = ({ className = 'w-10 h-10', title }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role={title ? 'img' : 'presentation'}
    aria-label={title}
  >
    {title && <title>{title}</title>}
    <text
      x="50"
      y="22"
      textAnchor="middle"
      fontFamily="system-ui, sans-serif"
      fontWeight="800"
      fontSize="13"
      fill="var(--text-primary)"
      letterSpacing="0.5"
    >
      varietal
    </text>
    <text
      x="50"
      y="86"
      textAnchor="middle"
      fontFamily="system-ui, sans-serif"
      fontWeight="800"
      fontSize="14"
      fill="var(--text-primary)"
      letterSpacing="0.5"
    >
      data
    </text>

    {/* rotated data tiles */}
    <g transform="translate(50, 49)">
      <rect x="-32" y="-15" width="22" height="22" rx="3" transform="rotate(45)" fill="#a3e635" />
      <rect x="-12" y="5" width="22" height="22" rx="3" transform="rotate(45)" fill="#10b981" />
      <rect x="8" y="-15" width="22" height="22" rx="3" transform="rotate(45)" fill="#f59e0b" />
    </g>

    {/* connecting lines and nodes */}
    <line x1="28" y1="58" x2="42" y2="44" stroke="var(--text-primary)" strokeWidth="2.5" />
    <circle cx="28" cy="58" r="3.5" fill="#f59e0b" stroke="var(--text-primary)" strokeWidth="2" />
    <line x1="58" y1="44" x2="72" y2="30" stroke="var(--text-primary)" strokeWidth="2.5" />
    <circle cx="72" cy="30" r="3.5" fill="#f59e0b" stroke="var(--text-primary)" strokeWidth="2" />

    {/* magnifier */}
    <circle cx="56" cy="48" r="12" fill="var(--surface-card)" stroke="var(--text-primary)" strokeWidth="3.5" />
    <circle cx="56" cy="48" r="8" fill="#10b981" opacity="0.15" />
    <line x1="64" y1="56" x2="76" y2="68" stroke="var(--text-primary)" strokeWidth="6" strokeLinecap="round" />
  </svg>
);

/**
 * Mill + circuitry + leaves. This is the tab favicon (see public/favicon.svg);
 * the component exists so the same mark can be used in-app if wanted.
 *
 * Its neutrals stay literal: it is teal-on-transparent with white knockout text,
 * which reads on either theme without token substitution.
 */
export const TechMillLogo: React.FC<LogoProps> = ({ className = 'w-10 h-10', title }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role={title ? 'img' : 'presentation'}
    aria-label={title}
  >
    {title && <title>{title}</title>}
    {/* gear base */}
    <path d="M 33 82 L 35 90 L 42 90 L 44 82 L 50 82 L 52 90 L 59 90 L 61 82 A 30 30 0 0 0 33 82 Z" fill="#0f766e" />
    <circle cx="47" cy="82" r="4.5" fill="white" />

    {/* factory silhouette */}
    <path d="M 22 82 L 22 40 L 30 40 L 30 58 L 38 50 L 38 60 L 46 52 L 46 82 Z" fill="#0f766e" />

    <text x="34" y="69" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="6.5" fill="white" letterSpacing="0.2">
      Gobind
    </text>
    <text x="34" y="76" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="5.5" fill="white" letterSpacing="0.2">
      Sugar Mills
    </text>

    {/* circuitry */}
    <g stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 46 45 L 46 38 L 56 28 L 56 21" />
      <circle cx="56" cy="21" r="2.5" fill="#0284c7" />
      <path d="M 46 62 L 60 62 L 60 42 L 68 34 L 75 34" />
      <circle cx="75" cy="34" r="2.5" fill="#0284c7" />
      <path d="M 46 72 L 68 72 L 68 52 L 76 44 L 84 44" />
      <circle cx="84" cy="44" r="2.5" fill="#0284c7" />
      <path d="M 61 80 L 82 80" />
      <circle cx="82" cy="80" r="2.5" fill="#0284c7" />
    </g>

    {/* leaves */}
    <path d="M 56 38 Q 66 18 82 18 Q 72 34 66 38 Z" fill="#10b981" />
    <path d="M 69 48 Q 82 28 95 34 Q 80 48 73 51 Z" fill="#65a30d" />
  </svg>
);
