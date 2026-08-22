/**
 * Operator marks.
 *
 * Drawn here rather than fetched, for the same reason the product artwork is
 * generated: a real network's logo is a trademark. The operators carry their
 * real names on this page, but **these marks are not their logos** -- they are
 * four original geometric shapes, one per operator, whose job is to tell four
 * chips apart in a row. The colours are for the same purpose.
 *
 * Inline SVG rather than files: they are a few hundred bytes each, they inherit
 * the operator colour as a prop, and they need no network request on a page
 * that already renders four of them.
 */

interface Props {
  operatorId: string;
  colour: string;
  /**
   * Sets the wordmark beside the badge.
   *
   * Pass it where the mark stands on its own as a brand chip; leave it off in
   * the compact rows where the name is already in the copy next to it, so the
   * name is not read out twice.
   */
  name?: string;
  /** Pixel height. Width follows the wordmark when there is one. */
  size?: number;
  className?: string;
}

export function OperatorMark({ operatorId, colour, name, size = 40, className }: Props) {
  const wordmark = name?.trim();
  // The viewBox grows with the name rather than being fixed, so "Vi" does not
  // sit in a box sized for "Airtel" with a hand's width of empty space after it.
  const width = wordmark ? 52 + wordmark.length * 11 : 40;

  return (
    <svg
      viewBox={`0 0 ${width} 40`}
      width={(size * width) / 40}
      height={size}
      className={className}
      role="img"
      // Labelled when it carries the name, hidden when it is decoration beside
      // text that already says it.
      {...(wordmark ? { 'aria-label': wordmark } : { 'aria-hidden': true })}
      focusable="false"
    >
      <circle cx="20" cy="20" r="20" fill={colour} />
      {glyph(operatorId)}
      {wordmark && (
        // `currentColor` rather than the brand colour: the badge carries the
        // colour, and a wordmark in Jio blue on a dark surface is unreadable.
        <text
          x="50"
          y="20"
          dominantBaseline="central"
          fontSize="19"
          fontWeight="700"
          letterSpacing="-0.4"
          fill="currentColor"
        >
          {wordmark}
        </text>
      )}
    </svg>
  );
}

/** One glyph per operator, so four chips in a row are told apart at a glance. */
function glyph(operatorId: string) {
  switch (operatorId) {
    // A signal arc rising from a point.
    case 'jio':
      return (
        <g fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
          <path d="M13 25a10 10 0 0 1 14 0" />
          <path d="M16.5 21a5.5 5.5 0 0 1 7 0" />
          <circle cx="20" cy="27" r="1.8" fill="#fff" stroke="none" />
        </g>
      );

    // A swept wing.
    case 'airtel':
      return (
        <path
          d="M10 26c6-1 10-4 13-9 1 4 0 7-2 9 3 0 6-1 8-3-1 5-6 9-12 9-3 0-6-2-7-6Z"
          fill="#fff"
        />
      );

    // Concentric rings, a calm signal.
    case 'bsnl':
      return (
        <g fill="none" stroke="#451a03" strokeWidth="2.4">
          <circle cx="20" cy="20" r="4" />
          <path d="M20 10a10 10 0 0 1 0 20" strokeLinecap="round" />
          <path d="M20 14a6 6 0 0 1 0 12" strokeLinecap="round" />
        </g>
      );

    // A beam from a tower.
    case 'vi':
    default:
      return (
        <g fill="#fff">
          <path d="M20 9l3.5 7h-7L20 9Z" />
          <rect x="18.6" y="16" width="2.8" height="15" rx="1.2" />
          <path
            d="M12 20.5a9 9 0 0 1 16 0"
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      );
  }
}
