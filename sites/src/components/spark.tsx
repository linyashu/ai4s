interface SparkPoint {
  ts: number
  heat: number
  itemId?: string
}

interface SparkProps {
  itemId?: string
  series: SparkPoint[]
  width?: number
  height?: number
}

export default function Spark({ itemId, series, width = 104, height = 32 }: SparkProps) {
  const itemSeries = series
    .filter((p) => p.heat > 0)
    .filter((p) => !itemId || p.itemId === itemId);

  if (itemSeries.length < 2) {
    return <span className="spark-empty" />;
  }

  const minTs = itemSeries[0].ts;
  const maxTs = itemSeries[itemSeries.length - 1].ts;
  const tsRange = maxTs - minTs || 1;
  const heatVals = itemSeries.map((p) => p.heat);
  const minH = Math.min(...heatVals);
  const maxH = Math.max(...heatVals);
  const hRange = maxH - minH || 1;

  const pad = 2;
  const points = itemSeries.map((p) => {
    const x = pad + ((p.ts - minTs) / tsRange) * (width - pad * 2);
    const y = height - pad - ((p.heat - minH) / hRange) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = points.join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const trend = heatVals[heatVals.length - 1] >= heatVals[0] ? "up" : "down";
  const stroke = trend === "up" ? "var(--accent-emerald)" : "var(--accent-rose)";

  return (
    <svg
      className="spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polygon points={area} fill={stroke} opacity="0.12" />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={points[points.length - 1].split(",")[0]}
        cy={points[points.length - 1].split(",")[1]}
        r="2"
        fill={stroke}
      />
    </svg>
  );
}
