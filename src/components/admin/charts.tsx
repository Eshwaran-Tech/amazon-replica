import { useId } from 'react';

/**
 * Dashboard charts as server-rendered SVG.
 *
 * No charting library and no client JavaScript: the data is already on the
 * server, the SVG is plain markup React escapes like any other, and it renders
 * identically with JS disabled. It also keeps the admin bundle -- and the CSP
 * -- exactly as small as the storefront's.
 */

const INR_COMPACT = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** "₹1.8L", "₹42k", "₹0" -- axis-sized money from integer paise. */
export function compactPaise(paise: number): string {
  return `₹${INR_COMPACT.format(paise / 100)}`;
}

/** A "nice" axis ceiling: 1, 2, 2.5, 5 x 10^n at or above `max`. */
function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= max) return step * magnitude;
  }
  return 10 * magnitude;
}

const SHORT_DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

function shortDate(dayKey: string): string {
  // Day keys are store-local YYYY-MM-DD; parse as UTC noon so no timezone
  // shift can move the label to a neighbouring day.
  return SHORT_DATE.format(new Date(`${dayKey}T12:00:00Z`));
}

/** Indices for ~`count` evenly spaced x-axis labels, always including the ends. */
function labelIndices(length: number, count: number): number[] {
  if (length <= count) return Array.from({ length }, (_, index) => index);
  const step = (length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => Math.round(index * step));
}

// -------------------------------------------------------------- area chart

interface AreaChartProps {
  points: Array<{ date: string; value: number }>;
  formatValue?: (value: number) => string;
  /** Accessible summary; the SVG itself is decorative. */
  label: string;
}

/**
 * Line + gradient area, in the dashboard's indigo. Smoothed with a Catmull-Rom
 * spline so a sparse month reads as a trend rather than a saw blade, but the
 * plotted points are the exact daily figures.
 */
export function AreaChart({ points, formatValue = compactPaise, label }: AreaChartProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9-]/g, '');
  const width = 640;
  const height = 220;
  const pad = { top: 12, right: 12, bottom: 28, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const max = niceCeiling(Math.max(...points.map((p) => p.value), 0));
  const xAt = (index: number) =>
    pad.left + (points.length > 1 ? (index / (points.length - 1)) * innerW : innerW / 2);
  const yAt = (value: number) => pad.top + innerH - (value / max) * innerH;

  const coords = points.map((p, index) => [xAt(index), yAt(p.value)] as const);

  // Catmull-Rom -> cubic Bezier.
  let path = '';
  coords.forEach(([x, y], index) => {
    if (index === 0) {
      path += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      return;
    }
    const p0 = coords[Math.max(0, index - 2)] ?? coords[index - 1] ?? [x, y];
    const p1 = coords[index - 1] ?? [x, y];
    const p3 = coords[Math.min(coords.length - 1, index + 1)] ?? [x, y];
    const c1x = p1[0] + (x - p0[0]) / 6;
    const c1y = p1[1] + (y - p0[1]) / 6;
    const c2x = x - (p3[0] - p1[0]) / 6;
    const c2y = y - (p3[1] - p1[1]) / 6;
    path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const first = coords[0];
  const last = coords[coords.length - 1];
  const areaPath =
    first && last
      ? `${path} L ${last[0].toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${first[0].toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`
      : '';

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);
  const xLabels = labelIndices(points.length, 6);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {gridValues.map((value) => (
        <g key={value}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={yAt(value)}
            y2={yAt(value)}
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeDasharray={value === 0 ? undefined : '3 4'}
          />
          <text
            x={pad.left - 8}
            y={yAt(value) + 4}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.6"
          >
            {formatValue(value)}
          </text>
        </g>
      ))}

      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
      {path && (
        <path
          d={path}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {xLabels.map((index) => {
        const point = points[index];
        if (!point) return null;
        return (
          <text
            key={point.date}
            x={xAt(index)}
            y={height - 8}
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.6"
          >
            {shortDate(point.date)}
          </text>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------ column chart

interface ColumnChartProps {
  points: Array<{ date: string; value: number }>;
  label: string;
}

/** Vertical bars in the dashboard's amber, one per day. */
export function ColumnChart({ points, label }: ColumnChartProps) {
  const width = 640;
  const height = 200;
  const pad = { top: 12, right: 12, bottom: 28, left: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const max = niceCeiling(Math.max(...points.map((p) => p.value), 0));
  const slot = points.length > 0 ? innerW / points.length : innerW;
  const barW = Math.max(3, Math.min(28, slot * 0.6));
  const yAt = (value: number) => pad.top + innerH - (value / max) * innerH;

  const gridValues = [0, 0.5, 1].map((fraction) => fraction * max);
  const xLabels = labelIndices(points.length, 6);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {gridValues.map((value) => (
        <g key={value}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={yAt(value)}
            y2={yAt(value)}
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeDasharray={value === 0 ? undefined : '3 4'}
          />
          <text
            x={pad.left - 8}
            y={yAt(value) + 4}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.6"
          >
            {Math.round(value)}
          </text>
        </g>
      ))}

      {points.map((point, index) => {
        const x = pad.left + index * slot + (slot - barW) / 2;
        const y = yAt(point.value);
        const h = pad.top + innerH - y;
        return (
          <rect
            key={point.date}
            x={x.toFixed(1)}
            y={y.toFixed(1)}
            width={barW.toFixed(1)}
            height={Math.max(0, h).toFixed(1)}
            rx="2"
            fill="#f5a524"
          >
            <title>{`${shortDate(point.date)}: ${point.value}`}</title>
          </rect>
        );
      })}

      {xLabels.map((index) => {
        const point = points[index];
        if (!point) return null;
        return (
          <text
            key={point.date}
            x={pad.left + index * slot + slot / 2}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.6"
          >
            {shortDate(point.date)}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------- horizontal bar chart

interface HorizontalBarChartProps {
  rows: Array<{ label: string; value: number }>;
  formatValue?: (value: number) => string;
  label: string;
}

/** Category-style bars with a value axis along the bottom. */
export function HorizontalBarChart({
  rows,
  formatValue = compactPaise,
  label,
}: HorizontalBarChartProps) {
  const width = 640;
  const rowH = 30;
  const pad = { top: 8, right: 16, bottom: 26, left: 120 };
  const height = pad.top + Math.max(rows.length, 1) * rowH + pad.bottom;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const max = niceCeiling(Math.max(...rows.map((r) => r.value), 0));
  const xAt = (value: number) => pad.left + (value / max) * innerW;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={xAt(value)}
            x2={xAt(value)}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeDasharray={value === 0 ? undefined : '3 4'}
          />
          <text
            x={xAt(value)}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.6"
          >
            {formatValue(value)}
          </text>
        </g>
      ))}

      {rows.map((row, index) => {
        const y = pad.top + index * rowH + 6;
        const w = xAt(row.value) - pad.left;
        return (
          <g key={row.label}>
            <text
              x={pad.left - 10}
              y={y + 13}
              textAnchor="end"
              fontSize="11"
              fill="currentColor"
              fillOpacity="0.85"
            >
              {row.label.length > 16 ? `${row.label.slice(0, 15)}…` : row.label}
            </text>
            <rect
              x={pad.left}
              y={y}
              width={Math.max(0, w).toFixed(1)}
              height={rowH - 12}
              rx="3"
              fill="#6366f1"
            >
              <title>{`${row.label}: ${formatValue(row.value)}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

// -------------------------------------------------------------- track bars

interface TrackBarsProps {
  rows: Array<{ label: string; value: number; display?: string }>;
  color?: 'indigo' | 'amber' | 'green';
}

/** Label / proportional bar / value rows, for status and method breakdowns. */
export function TrackBars({ rows, color = 'indigo' }: TrackBarsProps) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fill =
    color === 'amber' ? 'bg-accent-500' : color === 'green' ? 'bg-instock' : 'bg-indigo-500';

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-3 text-sm">
          <span className="text-ink-muted w-28 shrink-0 truncate text-xs font-medium">{row.label}</span>
          <span className="bg-surface-sunken relative h-2 flex-1 overflow-hidden rounded-full">
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${fill}`}
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
              aria-hidden="true"
            />
          </span>
          <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">
            {row.display ?? row.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
