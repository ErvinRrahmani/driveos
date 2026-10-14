import { niceCeiling } from '@/lib/reports';

export interface BarDatum {
  label: string;
  value: number;
}

const WIDTH = 640;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 40, left: 72 };
const TICKS = 5;

export function BarChart({
  title,
  data,
  formatValue,
  xLabel,
  yLabel,
}: {
  title: string;
  data: readonly BarDatum[];
  formatValue: (value: number) => string;
  xLabel: string;
  yLabel: string;
}) {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = niceCeiling(Math.max(0, ...data.map((datum) => datum.value)));
  const band = plotWidth / Math.max(1, data.length);
  const barWidth = Math.max(2, Math.min(48, band * 0.7));
  const y = (value: number) => MARGIN.top + plotHeight - (Math.max(0, value) / max) * plotHeight;
  const ticks = Array.from({ length: TICKS + 1 }, (_, index) => (max / TICKS) * index);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  return (
    <figure className="w-full">
      <svg
        role="img"
        aria-label={title}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full max-w-3xl"
      >
        <title>{title}</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeDasharray={tick === 0 ? undefined : '3 3'}
            />
            <text
              x={MARGIN.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}
        {data.map((datum, index) => {
          const x = MARGIN.left + band * index + (band - barWidth) / 2;
          const top = y(datum.value);
          return (
            <g key={`${datum.label}-${index}`}>
              <rect
                x={x}
                y={top}
                width={barWidth}
                height={MARGIN.top + plotHeight - top}
                rx={2}
                className="fill-primary"
              >
                <title>{`${datum.label}: ${formatValue(datum.value)}`}</title>
              </rect>
              {index % labelEvery === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={HEIGHT - MARGIN.bottom + 16}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {datum.label}
                </text>
              )}
            </g>
          );
        })}
        <text
          x={MARGIN.left + plotWidth / 2}
          y={HEIGHT - 4}
          textAnchor="middle"
          className="fill-foreground text-xs"
        >
          {xLabel}
        </text>
        <text
          transform={`translate(14 ${MARGIN.top + plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-foreground text-xs"
        >
          {yLabel}
        </text>
      </svg>
    </figure>
  );
}
