export default function StatsCard({ value, label, subLabel }) {
  const formattedValue = typeof value === 'number'
    ? value.toLocaleString('vi-VN')
    : value;

  return (
    <div className="stat-card bg-[var(--bg-secondary)] border-[var(--border-color)] rounded-sm p-3 text-center">
      <div
        className="text-2xl font-bold font-mono mb-1"
        style={{ color: 'var(--accent)' }}
      >
        {formattedValue}
      </div>
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
        {label}
      </div>
      {subLabel && (
        <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
          {subLabel}
        </div>
      )}
    </div>
  );
}
