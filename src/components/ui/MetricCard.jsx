import GlassPanel from "./GlassPanel";

export default function MetricCard({ label, value, detail = "", className = "" }) {
  return (
    <GlassPanel as="article" className={`metric-card rounded-2xl p-4 ${className}`.trim()}>
      <div className="metric-card-label text-xs uppercase tracking-[0.2em]">{label}</div>
      <div className="metric-card-value mt-2 text-2xl font-semibold">{value}</div>
      {detail ? <div className="metric-card-detail mt-1 text-xs">{detail}</div> : null}
    </GlassPanel>
  );
}