/**
 * SourceCard – displays a single cited article source below the bot answer.
 * Compact design with source badge, title, date, and similarity bar.
 */
export default function SourceCard({ source }) {
    const sourceColors = {
        'VnExpress': { main: '#3b82f6', light: 'rgba(59, 130, 246, 0.1)' },
        'Tuoi Tre': { main: '#06b6d4', light: 'rgba(6, 182, 212, 0.1)' },
        'Thanh Nien': { main: '#8b5cf6', light: 'rgba(139, 92, 246, 0.1)' },
    };

    const sourceLabels = {
        'VnExpress': 'VN',
        'Tuoi Tre': 'TT',
        'Thanh Nien': 'TN',
    };

    const colors = sourceColors[source.source] || { main: '#6b7280', light: 'rgba(107, 114, 128, 0.1)' };

    const formattedDate = source.published_at
        ? new Date(source.published_at).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
        : null;

    const similarityPercent = source.similarity != null
        ? Math.round(source.similarity * 100)
        : null;

    return (
        <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
            <div className="flex items-center gap-2 mb-1.5">
                <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                        background: colors.light,
                        color: colors.main,
                        border: `1px solid ${colors.main}`,
                    }}
                >
                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: colors.main }} />
                    {sourceLabels[source.source] ?? source.source}
                </span>
                {formattedDate && (
                    <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                        {formattedDate}
                    </span>
                )}
            </div>
            <h4 className="text-sm font-medium text-[var(--text-primary)] leading-snug line-clamp-1 group-hover:underline underline-offset-4 decoration-[var(--border-color)] group-hover:decoration-[var(--accent)]">
                {source.title}
            </h4>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-muted)]">
                {source.category && (
                    <span className="inline-flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" />
                            <path d="M16 2h6v6" />
                            <path d="M16 8l6-6" />
                        </svg>
                        {source.category}
                    </span>
                )}
                {similarityPercent !== null && (
                    <span className="ml-auto flex items-center gap-2 tabular-nums">
                        <span className="w-16 h-1 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                            <span
                                className="block h-full rounded-full"
                                style={{ width: `${Math.max(5, Math.min(100, similarityPercent))}%`, backgroundColor: colors.main }}
                            />
                        </span>
                        {similarityPercent}%
                    </span>
                )}
            </div>
        </a>
    );
}
