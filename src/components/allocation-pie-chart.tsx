import Decimal from "decimal.js";

type AllocationRow = {
  key: string;
  label: string;
  chartLabel: string;
  value: Decimal;
  weight: Decimal;
  color: string;
};

type AllocationPieChartProps = {
  rows: AllocationRow[];
  currency: string;
  usdRate: number | null;
};

function formatValue(value: Decimal, currency: string, usdRate: number | null): string {
  if (usdRate === null || usdRate <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value.div(usdRate).toNumber());
}

export function AllocationPieChart({ rows, currency, usdRate }: AllocationPieChartProps) {
  const total = rows.reduce((sum, row) => sum.plus(row.value), new Decimal(0));

  if (rows.length === 0 || total.isZero()) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-6 text-center text-xs text-zinc-500">
        Allocation appears when live quotes are available.
      </div>
    );
  }

  const centerX = 240;
  const centerY = 140;
  const radius = 88;
  const slices = rows
    .filter((row) => row.weight.toNumber() > 0)
    .reduce<{ angle: number; slices: Array<AllocationRow & { path: string; middleAngle: number }> }>((result, row) => {
      const startAngle = result.angle;
      const sweep = (row.weight.toNumber() / 100) * Math.PI * 2;
      const endAngle = startAngle + sweep;
      const largeArcFlag = sweep > Math.PI ? 1 : 0;
      const x1 = centerX + radius * Math.cos(startAngle);
      const y1 = centerY + radius * Math.sin(startAngle);
      const x2 = centerX + radius * Math.cos(endAngle);
      const y2 = centerY + radius * Math.sin(endAngle);
      const path = [
        `M ${centerX} ${centerY}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        "Z",
      ].join(" ");
      const middleAngle = startAngle + sweep / 2;

      return {
        angle: endAngle,
        slices: [...result.slices, { ...row, path, middleAngle }],
      };
    }, { angle: -Math.PI / 2, slices: [] }).slices;
  const callouts = slices
    .filter((slice) => slice.weight.toNumber() >= 4)
    .sort((left, right) => right.weight.toNumber() - left.weight.toNumber())
    .slice(0, 8);
  const calloutLayout = [-1, 1].flatMap((side) => {
    const sideCallouts = callouts
      .filter((slice) => Math.cos(slice.middleAngle) * side > 0)
      .sort((left, right) => Math.sin(left.middleAngle) - Math.sin(right.middleAngle));

    return sideCallouts.map((slice, index) => ({
      slice,
      side,
      labelY: 20 + ((index + 1) / (sideCallouts.length + 1)) * 240,
    }));
  });

  return (
    <div className="mx-auto w-full max-w-[480px]">
      <svg viewBox="0 0 480 280" className="h-[280px] w-full overflow-visible" role="img" aria-label="Asset allocation pie chart">
        {slices.map((slice) => (
          <path
            key={slice.key}
            d={slice.path}
            fill={slice.color}
            stroke="#0b0b0c"
            strokeWidth={2}
            className="transition-all duration-500"
          >
            <title>{`${slice.label}: ${formatValue(slice.value, currency, usdRate)} (${slice.weight.toFixed(2)}%)`}</title>
          </path>
        ))}
        {calloutLayout.map(({ slice, side, labelY }) => {
          const edgeX = centerX + radius * Math.cos(slice.middleAngle);
          const edgeY = centerY + radius * Math.sin(slice.middleAngle);
          const elbowX = centerX + side * 112;
          const labelX = centerX + side * 120;
          const label = `${slice.chartLabel.slice(0, 13)} ${slice.weight.toFixed(1)}%`;

          return (
            <g key={`callout-${slice.key}`}>
              <path d={`M ${edgeX} ${edgeY} L ${elbowX} ${labelY} L ${labelX} ${labelY}`} fill="none" stroke={slice.color} strokeWidth="1" />
              <text className="font-mono tabular-nums" x={centerX + side * 126} y={labelY + 3} textAnchor={side < 0 ? "end" : "start"} fill="#d4d4d8" fontSize="10">
                {label}
              </text>
            </g>
          );
        })}
        <circle cx={centerX} cy={centerY} r="48" fill="#0b0b0c" stroke="#27272a" strokeWidth="1" />
        <text x={centerX} y={centerY - 5} textAnchor="middle" fill="#a1a1aa" fontSize="11" fontWeight="600">Total</text>
        <text className="font-mono tabular-nums" x={centerX} y={centerY + 14} textAnchor="middle" fill="#f4f4f5" fontSize="14" fontWeight="700">
          {rows.length}
        </text>
      </svg>
    </div>
  );
}
