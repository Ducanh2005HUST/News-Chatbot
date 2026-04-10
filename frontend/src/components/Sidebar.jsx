import { useState, useEffect } from 'react';
import { fetchStats } from '../api/chatApi';

const ALL_SOURCES = ['VnExpress', 'Tuoi Tre', 'Thanh Nien'];
const ALL_CATEGORIES = ['Cong nghe', 'Kinh te', 'The thao', 'The gioi'];

const SOURCE_LABELS = {
    'VnExpress': 'VnExpress',
    'Tuoi Tre': 'Tuổi Trẻ',
    'Thanh Nien': 'Thanh Niên',
};

const SOURCE_COLORS = {
    'VnExpress': { dot: '#3b82f6', badge: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/50' },
    'Tuoi Tre':  { dot: '#10b981', badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/50' },
    'Thanh Nien':{ dot: '#f59e0b', badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/50' },
};

const CATEGORY_LABELS = {
    'Cong nghe': 'Công nghệ',
    'Kinh te':   'Kinh tế',
    'The thao':  'Thể thao',
    'The gioi':  'Thế giới',
};

const CATEGORY_ICONS = {
    'Cong nghe': '💻',
    'Kinh te':   '📈',
    'The thao':  '⚽',
    'The gioi':  '🌏',
};

export default function Sidebar({
    filters,
    onFiltersChange,
    collapsed,
    onToggle,
    chats = [],
    activeChatId = null,
    onNewChat,
    onSelectChat,
    onRenameChat,
    onDeleteChat,
    onExportChat,
}) {
    const [stats, setStats] = useState(null);
    const [statsError, setStatsError] = useState(false);
    const [chatQuery, setChatQuery] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [draftTitle, setDraftTitle] = useState('');

    useEffect(() => {
        let timer;
        async function load() {
            try { const data = await fetchStats(); setStats(data); setStatsError(false); }
            catch { setStatsError(true); }
        }
        load();
        timer = setInterval(load, 60_000);
        return () => clearInterval(timer);
    }, []);

    function toggleSource(src) {
        const current = filters.sources.length === 0 ? ALL_SOURCES : filters.sources;
        const nextSelected = current.includes(src) ? current.filter(s => s !== src) : [...current, src];
        onFiltersChange({ ...filters, sources: nextSelected.length === ALL_SOURCES.length ? [] : nextSelected });
    }

    function toggleCategory(cat) {
        const current = filters.categories.length === 0 ? ALL_CATEGORIES : filters.categories;
        const nextSelected = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
        onFiltersChange({ ...filters, categories: nextSelected.length === ALL_CATEGORIES.length ? [] : nextSelected });
    }

    function resetFilters() { onFiltersChange({ sources: [], categories: [] }); }

    const lastUpdated = stats?.last_crawled_at
        ? new Date(stats.last_crawled_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
        : '--';

    const effectiveSources = filters.sources.length === 0 ? ALL_SOURCES : filters.sources;
    const effectiveCategories = filters.categories.length === 0 ? ALL_CATEGORIES : filters.categories;
    const isAllSources = filters.sources.length === 0;
    const isAllCategories = filters.categories.length === 0;
    const isAll = isAllSources && isAllCategories;

    const filteredChats = chats.filter(c => {
        if (!chatQuery.trim()) return true;
        return (c?.title ?? '').toString().toLowerCase().includes(chatQuery.trim().toLowerCase());
    });

    return (
        <aside
            id="sidebar"
            className={`
                ${collapsed ? 'w-0 overflow-hidden' : 'w-72'}
                flex-shrink-0 border-r border-[var(--border-color)]
                bg-[var(--bg-elevated)] backdrop-blur-xl
                transition-all duration-300 ease-in-out
                flex flex-col h-full
            `}
        >
            <div className="flex-1 overflow-y-auto flex flex-col">

                {/* ── Header ── */}
                <div className="p-5 border-b border-[var(--border-color)] flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-[var(--shadow-sm)]" style={{ background: 'var(--accent-gradient)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H6a2 2 0 0 1-2-2V7z"/>
                            <path d="M8 9h8"/><path d="M8 13h6"/>
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-sm font-bold text-[var(--text-primary)] leading-tight tracking-tight">Chatbot Tin tức</h1>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">RAG · VnExpress · Tuổi Trẻ · Thanh Niên</p>
                    </div>
                    <button
                        type="button" onClick={onToggle}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        title="Thu gọn sidebar"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5">

                    {/* ── Online badge + Reset filter ── */}
                    <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-medium">
                            <span className={`w-2 h-2 rounded-full ${statsError ? 'bg-red-500' : 'bg-emerald-500 animate-pulse-slow'}`} />
                            {statsError ? 'Backend chưa hoạt động' : 'Đã kết nối'}
                        </span>
                        {!isAll && (
                            <button type="button" onClick={resetFilters}
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]">
                                Xóa lọc
                            </button>
                        )}
                    </div>

                    {/* ── Stats mini card ── */}
                    <div id="stats-dashboard" className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] p-4 shadow-[var(--shadow-xs)]">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Thống kê dữ liệu</p>
                            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{lastUpdated}</span>
                        </div>
                        {statsError ? (
                            <p className="text-xs text-red-500 flex items-center gap-1.5">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                                Không tải được thống kê
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl bg-[var(--bg-tertiary)] p-3 border border-[var(--border-soft)]">
                                    <p className="text-[10px] text-[var(--text-muted)] mb-1">📰 Bài báo</p>
                                    <p className="text-xl font-bold text-[var(--text-primary)] tabular-nums leading-none">
                                        {stats?.total_articles != null ? stats.total_articles.toLocaleString() : <span className="shimmer inline-block w-8 h-5 rounded" />}
                                    </p>
                                </div>
                                <div className="rounded-xl bg-[var(--bg-tertiary)] p-3 border border-[var(--border-soft)]">
                                    <p className="text-[10px] text-[var(--text-muted)] mb-1">🗂️ Chunks</p>
                                    <p className="text-xl font-bold text-[var(--text-primary)] tabular-nums leading-none">
                                        {stats?.total_chunks != null ? stats.total_chunks.toLocaleString() : <span className="shimmer inline-block w-8 h-5 rounded" />}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Chats ── */}
                    <div>
                        <div className="flex items-center justify-between mb-2.5">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Cuộc trò chuyện</h2>
                            <button type="button" onClick={() => onNewChat && onNewChat()}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full text-white shadow-[var(--shadow-sm)] hover:opacity-90 active:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                                style={{ background: 'var(--accent-gradient)' }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                                Mới
                            </button>
                        </div>

                        {/* Search chats */}
                        <div className="relative mb-2.5">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                            <input
                                value={chatQuery}
                                onChange={e => setChatQuery(e.target.value)}
                                placeholder="Tìm cuộc trò chuyện..."
                                className="w-full pl-8 pr-8 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] shadow-[var(--shadow-xs)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                            />
                            {chatQuery.trim() && (
                                <button type="button" onClick={() => setChatQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title="Xóa">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                                </button>
                            )}
                        </div>

                        <div className="space-y-1">
                            {filteredChats.length === 0 ? (
                                <p className="text-xs text-[var(--text-muted)] px-1 py-2">Không có cuộc trò chuyện nào.</p>
                            ) : (
                                filteredChats.map((chat) => {
                                    const active = chat.id === activeChatId;
                                    const when = chat.updatedAt
                                        ? new Date(chat.updatedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
                                        : '';
                                    const isEditing = editingId === chat.id;

                                    return (
                                        <div key={chat.id}
                                            className={`group rounded-xl border transition-all duration-150 ${active
                                                ? 'border-[var(--accent)]/30 bg-[var(--accent-soft)] shadow-[var(--shadow-xs)]'
                                                : 'border-transparent hover:border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1.5 px-2.5 py-2">
                                                <button type="button" onClick={() => onSelectChat && onSelectChat(chat.id)} className="flex-1 min-w-0 text-left" title={chat.title}>
                                                    {isEditing ? (
                                                        <input autoFocus value={draftTitle} onChange={e => setDraftTitle(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') { e.preventDefault(); onRenameChat && onRenameChat(chat.id, draftTitle); setEditingId(null); }
                                                                if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                                                            }}
                                                            onBlur={() => { onRenameChat && onRenameChat(chat.id, draftTitle); setEditingId(null); }}
                                                            className="w-full px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                                                            maxLength={80}
                                                        />
                                                    ) : (
                                                        <>
                                                            <p className={`text-xs font-semibold truncate ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                                                                {chat.title || 'Cuộc trò chuyện'}
                                                            </p>
                                                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5 tabular-nums">{when}</p>
                                                        </>
                                                    )}
                                                </button>

                                                {!isEditing && (
                                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button type="button" onClick={() => { setEditingId(chat.id); setDraftTitle(chat.title || ''); }}
                                                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus:outline-none"
                                                            title="Đổi tên">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                        </button>
                                                        <button type="button" onClick={() => onExportChat && onExportChat(chat.id)}
                                                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus:outline-none"
                                                            title="Tải JSON">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                                                        </button>
                                                        <button type="button" onClick={() => onDeleteChat && onDeleteChat(chat.id)}
                                                            className="p-1.5 rounded-lg text-red-400/70 hover:text-red-500 hover:bg-red-500/10 transition-colors focus:outline-none"
                                                            title="Xóa">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* ── Source filters ── */}
                    <div>
                        <div className="flex items-center justify-between mb-2.5">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Nguồn báo</h2>
                            <span className="text-[10px] text-[var(--text-muted)]">
                                {isAllSources ? 'Tất cả' : `${effectiveSources.length}/${ALL_SOURCES.length}`}
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            {ALL_SOURCES.map((src) => {
                                const active = effectiveSources.includes(src);
                                const color = SOURCE_COLORS[src];
                                return (
                                    <button key={src} id={`filter-source-${src.replace(/\s/g, '-')}`}
                                        onClick={() => toggleSource(src)}
                                        className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 border focus:outline-none focus:ring-2 focus:ring-[var(--ring)] ${
                                            active
                                                ? `${color.badge} border shadow-[var(--shadow-xs)]`
                                                : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:border-[var(--border-color)]'
                                        }`}
                                    >
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color.dot, opacity: active ? 1 : 0.4 }} />
                                        {SOURCE_LABELS[src] ?? src}
                                        {stats?.sources_breakdown?.[src] != null && (
                                            <span className="ml-auto text-xs opacity-60 tabular-nums font-normal">{stats.sources_breakdown[src]}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Category filters ── */}
                    <div>
                        <div className="flex items-center justify-between mb-2.5">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Chủ đề</h2>
                            <span className="text-[10px] text-[var(--text-muted)]">
                                {isAllCategories ? 'Tất cả' : `${effectiveCategories.length}/${ALL_CATEGORIES.length}`}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            {ALL_CATEGORIES.map((cat) => {
                                const active = effectiveCategories.includes(cat);
                                return (
                                    <button key={cat} id={`filter-category-${cat.replace(/\s/g, '-')}`}
                                        onClick={() => toggleCategory(cat)}
                                        className={`flex items-center gap-2 text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 border focus:outline-none focus:ring-2 focus:ring-[var(--ring)] ${
                                            active
                                                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/25 shadow-[var(--shadow-xs)]'
                                                : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:border-[var(--border-color)]'
                                        }`}
                                    >
                                        <span className="text-sm leading-none">{CATEGORY_ICONS[cat]}</span>
                                        {CATEGORY_LABELS[cat] ?? cat}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-4 py-3 border-t border-[var(--border-color)] flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)]">Đồ án KHDL</span>
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums">v1.0</span>
            </div>
        </aside>
    );
}
