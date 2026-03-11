export default function SectionHeader({ title, subtitle = "", right = null, className = "" }) {
  return (
    <div className={`section-header flex flex-wrap items-center justify-between gap-2 ${className}`.trim()}>
      <div>
        <h2 className="section-header-title text-lg font-semibold tracking-wide">{title}</h2>
        {subtitle ? (
          <p className="section-header-subtitle text-xs uppercase tracking-[0.18em]">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}