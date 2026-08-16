import type { ComponentType, SVGProps } from 'react';

/**
 * The sports the icon set has no glyph for. Drawn from Tabler Icons (MIT), which
 * shares the 24×24 grid and 2px stroke of the set already in use, so a ball sits
 * next to a trophy without looking borrowed. Copied as paths rather than pulled
 * in as a second icon dependency for the handful of glyphs that were missing.
 */

/** Wide enough for the icon set's own glyphs and the ones drawn here alike. */
export type SportIcon = ComponentType<SVGProps<SVGSVGElement>>;

const Svg = ({ children, ...props }: SVGProps<SVGSVGElement>): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
);

/** The panelled ball: a pentagon at the centre with its seams running off it. */
export const FootballIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <path d="M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55z" />
    <path d="M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45" />
  </Svg>
);

/** Seams over the whole ball, the way a basketball is lined. */
export const BasketballIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <path d="M5.65 5.65l12.7 12.7" />
    <path d="M5.65 18.35l12.7 -12.7" />
    <path d="M12 3a9 9 0 0 0 9 9" />
    <path d="M3 12a9 9 0 0 1 9 9" />
  </Svg>
);

/** One curved seam down each side. */
export const TennisBallIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <path d="M6 5.3a9 9 0 0 1 0 13.4" />
    <path d="M18 5.3a9 9 0 0 0 0 13.4" />
  </Svg>
);

/** The stitched ball. */
export const BaseballIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M5.636 18.364a9 9 0 1 0 12.728 -12.728a9 9 0 0 0 -12.728 12.728z" />
    <path d="M12.495 3.02a9 9 0 0 1 -9.475 9.475" />
    <path d="M20.98 11.505a9 9 0 0 0 -9.475 9.475" />
    <path d="M9 9l2 2" />
    <path d="M13 13l2 2" />
    <path d="M11 7l2 1" />
    <path d="M7 11l1 2" />
    <path d="M16 11l1 2" />
    <path d="M11 16l2 1" />
  </Svg>
);

/** The banded ball. */
export const VolleyballIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <path d="M12 12a8 8 0 0 0 8 4" />
    <path d="M7.5 13.5a12 12 0 0 0 8.5 6.5" />
    <path d="M12 12a8 8 0 0 0 -7.464 4.928" />
    <path d="M12.951 7.353a12 12 0 0 0 -9.88 4.111" />
    <path d="M12 12a8 8 0 0 0 -.536 -8.928" />
    <path d="M15.549 15.147a12 12 0 0 0 1.38 -10.611" />
  </Svg>
);

/** The pointed ball, laces across it - rugby and the American game alike. */
export const RugbyIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M15 9l-6 6" />
    <path d="M10 12l2 2" />
    <path d="M12 10l2 2" />
    <path d="M8 21a5 5 0 0 0 -5 -5" />
    <path d="M16 3c-7.18 0 -13 5.82 -13 13a5 5 0 0 0 5 5c7.18 0 13 -5.82 13 -13a5 5 0 0 0 -5 -5" />
    <path d="M16 3a5 5 0 0 0 5 5" />
  </Svg>
);

/** A player mid-throw. */
export const HandballIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M13 21l3.5 -2l-4.5 -4l2 -4.5" />
    <path d="M7 6l2 4l5 .5l4 2.5l2.5 3" />
    <path d="M4 20l5 -1l1.5 -2" />
    <path d="M15 7a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
    <path d="M9.5 5a.5 .5 0 1 0 0 -1a.5 .5 0 0 0 0 1z" fill="currentColor" />
  </Svg>
);

/** Flag on the green. */
export const GolfIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M12 18v-15l7 4l-7 4" />
    <path d="M9 17.67c-.62 .36 -1 .82 -1 1.33c0 1.1 1.8 2 4 2s4 -.9 4 -2c0 -.5 -.38 -.97 -1 -1.33" />
  </Svg>
);

/** Paddle and ball. */
export const TableTennisIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M12.718 20.713a7.64 7.64 0 0 1 -7.48 -12.755l.72 -.72a7.643 7.643 0 0 1 9.105 -1.283l2.387 -2.345a2.08 2.08 0 0 1 3.057 2.815l-.116 .126l-2.346 2.387a7.644 7.644 0 0 1 -1.052 8.864" />
    <path d="M14 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <path d="M9.3 5.3l9.4 9.4" />
  </Svg>
);

/** Bat and ball. */
export const CricketIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M11.105 18.79l-1 .992a4.159 4.159 0 0 1 -6.038 -5.715l.157 -.166l8.282 -8.401l1.5 1.5l3.45 -3.391a2.08 2.08 0 0 1 3.057 2.815l-.116 .126l-3.391 3.45l1.5 1.5l-3.668 3.617" />
    <path d="M10.5 7.5l6 6" />
    <path d="M14 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
  </Svg>
);

/** A fighter mid-kick, for the combat sports. */
export const FightingIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M18 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M3 9l4.5 1l3 2.5" />
    <path d="M13 21v-8l3 -5.5" />
    <path d="M8 4.5l4 2l4 1l4 3.5l-2 3.5" />
  </Svg>
);

/** Arrow in the board. */
export const DartsIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M12 7a5 5 0 1 0 5 5" />
    <path d="M13 3.055a9 9 0 1 0 7.941 7.945" />
    <path d="M15 6v3h3l3 -3h-3v-3z" />
    <path d="M15 9l-3 3" />
  </Svg>
);

/** The drilled ball - bowling, and the cue sports alongside it. */
export const BowlingIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <path d="M11 9l0 .01" />
    <path d="M15 8l0 .01" />
    <path d="M14 12l0 .01" />
  </Svg>
);

/** Stick and puck. */
export const HockeyIcon: SportIcon = (props) => (
  <Svg {...props}>
    <path d="M4 3.5 10.5 16H16" />
    <ellipse cx="19" cy="19" rx="3" ry="1.8" />
  </Svg>
);
