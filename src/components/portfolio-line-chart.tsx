type ChartPoint = {
  timestamp: number;
  totalValue: number;
  isDiscontinuous?: boolean;
};

type PortfolioLineChartProps = {
  points: ChartPoint[];
  currency: string;
  displayCurrencyUsdRate: number | null;
};

function formatCurrency(value: number, currency: string, usdRate: number | null): string {
  if (usdRate === null || usdRate <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / usdRate);
}

export function PortfolioLineChart({ points, currency, displayCurrencyUsdRate }: PortfolioLineChartProps) {
  if (!points.length) return null;

  const width = 640;
  const height = 300;
  const padding = 28;

  const values = points.map((point) => point.totalValue);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  const xFor = (index: number) => {
    if (points.length <= 1) return width / 2;
    return padding + (index / (points.length - 1)) * (width - padding * 2);
  };

  const yFor = (value: number) => {
    const ratio = (value - minValue) / valueRange;
    return height - padding - ratio * (height - padding * 2);
  };

  const segments: ChartPoint[][] = [];
  let currentSegment: ChartPoint[] = [];

  for (const point of points) {
    if (currentSegment.length === 0) {
      currentSegment = [point];
      continue;
    }

    if (point.isDiscontinuous) {
      segments.push(currentSegment);
      currentSegment = [point];
      continue;
    }

    currentSegment.push(point);
  }

  if (currentSegment.length > 0) segments.push(currentSegment);

  return (
    <div className="h-[350px] w-full min-h-[300px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Portfolio value over time">
        {[0, 1, 2, 3].map((tick) => {
          const ratio = tick / 3;
          const y = padding + ratio * (height - padding * 2);
          const labelValue = maxValue - ratio * valueRange;

          return (
            <g key={tick}>
              <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="#27272a" strokeDasharray="4 6" />
              <text x={6} y={y + 4} fill="#a1a1aa" fontSize="10">{formatCurrency(labelValue, currency, displayCurrencyUsdRate)}</text>
            </g>
          );
        })}

        {segments.map((segment, index) => {
          if (segment.length < 2) return null;
          const d = segment
            .map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${xFor(points.indexOf(point))} ${yFor(point.totalValue)}`)
            .join(" ");

          return (
            <path
              key={`${segment[0].timestamp}-${index}`}
              d={d}
              fill="none"
              stroke="#34d399"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {points.map((point, index) => (
          <g key={`${point.timestamp}-${index}`}>
            <circle cx={xFor(index)} cy={yFor(point.totalValue)} r={3} fill="#34d399" stroke="#06251a" strokeWidth={2} />
          </g>
        ))}

        {points.length > 0 ? (
          <g>
            <text x={padding} y={height - 8} fill="#a1a1aa" fontSize="10">
              {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(points[0].timestamp))}
            </text>
            <text x={width - padding - 60} y={height - 8} fill="#a1a1aa" fontSize="10">
              {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(points[points.length - 1].timestamp))}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
