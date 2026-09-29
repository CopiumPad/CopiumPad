import Decimal from "decimal.js";

type AllocationRow = {
  key: string;
  label: string;
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
      <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-6 text-center text-xs text-zinc-500">
        Allocation appears when live quotes are available.
      </div>
    );
  }

  const radius = 90;
  let startAngle = -Math.PI / 2;

  const slices = rows
    .filter((row) => row.weight.toNumber() > 0)
    .map((row) => {
      const sweep = (row.weight.toNumber() / 100) * Math.PI * 2;
      const endAngle = startAngle + sweep;
      const largeArcFlag = sweep > Math.PI ? 1 : 0;
      const x1 = 130 + radius * Math.cos(startAngle);
      const y1 = 130 + radius * Math.sin(startAngle);
      const x2 = 130 + radius * Math.cos(endAngle);
      const y2 = 130 + radius * Math.sin(endAngle);
      const path = [
        `M 130 130`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        "Z",
      ].join(" ");

      startAngle = endAngle;

      return { ...row, path };
    });

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
      <div className="mx-auto w-full max-w-[260px]">
        <svg viewBox="0 0 260 260" className="h-[260px] w-full overflow-visible" role="img" aria-label="Asset allocation pie chart">
          {slices.map((slice) => (
            <path
              key={slice.key}
              d={slice.path}
              fill={slice.color}
              stroke="#09090b"
              strokeWidth={2}
              className="transition-all duration-500"
            >
              <title>{`${slice.label}: ${formatValue(slice.value, currency, usdRate)} (${slice.weight.toFixed(2)}%)`}</title>
            </path>
          ))}
          <circle cx="130" cy="130" r="52" fill="#09090b" stroke="#27272a" strokeWidth="1" />
          <text x="130" y="123" textAnchor="middle" fill="#a1a1aa" fontSize="11" fontWeight="600">Total</text>
          <text x="130" y="142" textAnchor="middle" fill="#f4f4f5" fontSize="14" fontWeight="700">
            {rows.length}
          </text>
        </svg>
      </div>

      <div className="flex-1 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/30 px-3 py-2" title={`${row.label}: ${formatValue(row.value, currency, usdRate)} (${row.weight.toFixed(2)}%)`}>
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-zinc-200">{row.label}</span>
                <span className="font-mono text-zinc-300">{row.weight.toFixed(2)}%</span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-zinc-500">{formatValue(row.value, currency, usdRate)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
