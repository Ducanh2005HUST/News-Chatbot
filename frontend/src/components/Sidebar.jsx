import { useState, useEffect } from 'react';
import { fetchStats } from '../api/chatApi';
import StatsCard from './StatsCard';
import SearchInput from './SearchInput';

const ALL_SOURCES = ['VnExpress', 'Tuoi Tre', 'Thanh Nien'];
const ALL_CATEGORIES = ['Cong nghe', 'Kinh te', 'The thao', 'The gioi'];

const SOURCE_LABELS = {
  'VnExpress': 'VN',
  'Tuoi Tre': 'TT',
  'Thanh Nien': 'TN',
};

const CATEGORY_LABELS = {
  'Cong nghe': 'Công nghệ',
  'Kinh te': 'Kinh tế',
  'The thao': 'Thể thao',
  'The gioi': 'Thế giới',
};

// Source color mapping (cool palette)
const SOURCE_COLORS = {
  'VnExpress': '#3b82f6',   // blue
  'Tuoi Tre': '#06b6d4',    // cyan
  'Thanh Nien': '#8b5cf6',  // purple
};

/**
 * Sidebar - Redesigned with editorial newspaper aesthetic
 * Stats grid, chip filters, search, clean typography
 */
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
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Fetch stats on mount and every 60 seconds
  useEffect(() => {
    let timer;
    async function load() {
      try {
        const data = await fetchStats();
        setStats(data);
        setStatsError(false);
      } catch {
        setStatsError(true);
      }
    }
    load();
    timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  function toggleSource(src) {
    const current = filters.sources.length === 0 ? ALL_SOURCES : filters.sources;
    const nextSelected = current.includes(src)
        ? current.filter((s) => s !== src)
        : [...current, src];
    const next = nextSelected.length === ALL_SOURCES.length ? [] : nextSelected;
    onFiltersChange({ ...filters, sources: next });
  }

  function toggleCategory(cat) {
    const current = filters.categories.length === 0 ? ALL_CATEGORIES : filters.categories;
    const nextSelected = current.includes(cat)
        ? current.filter((c) => c !== cat)
        : [...current, cat];
    const next = nextSelected.length === ALL_CATEGORIES.length ? [] : nextSelected;
    onFiltersChange({ ...filters, categories: next });
  }

  function resetFilters() {
    onFiltersChange({ sources: [], categories: [] });
  }

  const lastCrawl = stats?.last_crawled_at
      ? new Date(stats.last_crawled_at).toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '--';

  const effectiveSources = filters.sources.length === 0 ? ALL_SOURCES : filters.sources;
  const effectiveCategories = filters.categories.length === 0 ? ALL_CATEGORIES : filters.categories;
  const isAllSources = filters.sources.length === 0;
  const isAllCategories = filters.categories.length === 0;

  const filteredChats = chats.filter((c) => {
    if (!chatQuery.trim()) return true;
    const t = (c?.title ?? '').toString().toLowerCase();
    return t.includes(chatQuery.trim().toLowerCase());
  });

  return (
    <aside
      id="sidebar"
      className={`
        ${collapsed ? 'w-[80px]' : 'w-80'}
        flex-shrink-0
        border-r border-[var(--border-color)]
        bg-[var(--bg-secondary)]
        transition-all duration-250 ease-in-out
        flex flex-col
        h-full
        overflow-hidden
      `}
      style={{ minWidth: collapsed ? '80px' : '320px' }}
    >
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* ── Header: Logo & Status ───────────────────────────── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded flex items-center justify-center shadow-sm flex-shrink-0"
              style={{
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent)/15',
              }}
            >
              <span className="text-xl" role="img" aria-label="News icon">
                📰
              </span>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1
                  className="text-sm font-bold leading-tight truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Tin tức AI
                </h1>
                <p
                  className="text-[11px] leading-tight mt-0.5 truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Vietnamese News
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      background: statsError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      color: statsError ? '#ef4444' : '#10b981',
                      border: '1px solid',
                      borderColor: statsError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    }}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${statsError ? 'bg-red-500' : 'bg-emerald-500'}`}
                    />
                    {statsError ? 'Offline' : 'Online'}
                  </span>
                  {!statsError && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      disabled={isAllSources && isAllCategories}
                      className="text-[10px] px-3 py-1.5 rounded border transition-colors disabled:opacity-40 min-h-[44px] flex items-center justify-center"
                      style={{
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-muted)',
                        background: 'transparent',
                      }}
                      title="Xóa tất cả bộ lọc"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggle}
            className="p-3 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors focus:ring-2 focus:ring-[var(--ring)] min-w-[44px] min-h-[44px]"
            aria-label="Thu gọn sidebar"
            title="Thu gọn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        {/* ── Stats Grid ───────────────────────────────────────── */}
        {!collapsed && (
          <div className="grid grid-cols-2 gap-2">
            <StatsCard
              value={stats?.total_articles ?? '--'}
              label="Bài báo"
            />
            <StatsCard
              value={stats?.total_chunks ?? '--'}
              label="Chunks"
            />
            <StatsCard
              value={Object.keys(stats?.sources_breakdown || {}).length}
              label="Nguồn"
            />
            <StatsCard
              value={lastCrawl}
              label="Crawl cuối"
              subLabel=""
            />
          </div>
        )}

        {/* ── Chat History ─────────────────────────────────────── */}
        {!collapsed && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Đoạn chat
              </h2>
              <button
                type="button"
                onClick={onNewChat}
                className="text-[10px] font-semibold px-4 py-2 rounded-md transition-colors min-h-[44px] flex items-center justify-center"
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                }}
                title="Tạo đoạn chat mới"
              >
                + Mới
              </button>
            </div>

            <SearchInput
              value={chatQuery}
              onChange={setChatQuery}
              placeholder="Tìm kiếm đoạn chat..."
            />

            <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
              {filteredChats.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                  {chatQuery ? 'Không tìm thấy' : 'Chưa có đoạn chat nào'}
                </p>
              ) : (
                filteredChats.map((chat) => {
                  const active = chat.id === activeChatId;
                  const when = chat.updatedAt
                      ? new Date(chat.updatedAt).toLocaleDateString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '';
                  const isEditing = editingId === chat.id;

                  return (
                    <div
                      key={chat.id}
                      className={`
                        group rounded-md border transition-all duration-150
                        ${active
                          ? 'border-l-2 border-l-accent bg-accent-soft'
                          : 'border border-transparent hover:bg-[var(--bg-tertiary)]'}
                      `}
                      style={{
                        borderLeftColor: active ? 'var(--accent)' : undefined,
                        background: active ? 'var(--accent-soft)' : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2 px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onSelectChat && onSelectChat(chat.id)}
                          className="flex-1 min-w-0 text-left"
                          title={chat.title}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              value={draftTitle}
                              onChange={(e) => setDraftTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  onRenameChat && onRenameChat(chat.id, draftTitle);
                                  setEditingId(null);
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setEditingId(null);
                                }
                              }}
                              onBlur={() => {
                                onRenameChat && onRenameChat(chat.id, draftTitle);
                                setEditingId(null);
                              }}
                              className="w-full px-2 py-3 text-sm rounded border bg-[var(--bg-secondary)] focus:ring-2 focus:ring-[var(--ring)] focus:outline-none"
                              style={{ borderColor: 'var(--border-color)' }}
                              maxLength={80}
                            />
                          ) : (
                            <>
                              <p
                                className="text-sm font-medium truncate"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {chat.title || 'Đoạn chat'}
                              </p>
                              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                                {when}
                              </p>
                            </>
                          )}
                        </button>

                        {!isEditing && (
                          <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(chat.id);
                                setDraftTitle(chat.title || '');
                              }}
                              className="h-full px-2 min-w-[44px] flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                              title="Đổi tên"
                              aria-label="Đổi tên đoạn chat"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => onExportChat && onExportChat(chat.id)}
                              className="h-full px-2 min-w-[44px] flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                              title="Tải JSON"
                              aria-label="Tải đoạn chat"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <path d="M7 10l5 5 5-5" />
                                <path d="M12 15V3" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteChat && onDeleteChat(chat.id)}
                              className="h-full px-2 min-w-[44px] flex items-center justify-center rounded text-red-500/80 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                              title="Xóa"
                              aria-label="Xóa đoạn chat"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                              </svg>
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
        )}

        {/* ── Filters ───────────────────────────────────────────── */}
        {!collapsed && (
          <div className="space-y-4 border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
            {/* Filters header with toggle */}
            <div
              className="flex items-center justify-between cursor-pointer py-4"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
            >
              <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Bộ lọc
              </h2>
              <svg
                width="14"
                height="14"
                style={{
                  transform: filtersExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.2s',
                  color: 'var(--text-muted)',
                }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {filtersExpanded && (
              <>
                {/* Sources - compact chips */}
                <div className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Nguồn báo
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_SOURCES.map((src) => {
                      const active = effectiveSources.includes(src);
                      return (
                        <button
                          key={src}
                          onClick={() => toggleSource(src)}
                          className="filter-chip px-4 py-2 text-xs font-medium rounded border transition-all min-h-[44px] flex items-center justify-center"
                          style={{
                            borderColor: active ? 'var(--accent)' : 'var(--border-color)',
                            background: active ? 'var(--accent-soft)' : 'transparent',
                            color: active ? 'var(--accent)' : 'var(--text-secondary)',
                          }}
                        >
                          {SOURCE_LABELS[src]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Categories - compact chips */}
                <div className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Chủ đề
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_CATEGORIES.map((cat) => {
                      const active = effectiveCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => toggleCategory(cat)}
                          className="filter-chip px-4 py-2 text-xs font-medium rounded border transition-all min-h-[44px] flex items-center justify-center"
                          style={{
                            borderColor: active ? 'var(--accent)' : 'var(--border-color)',
                            background: active ? 'var(--accent-soft)' : 'transparent',
                            color: active ? 'var(--accent)' : 'var(--text-secondary)',
                          }}
                        >
                          {CATEGORY_LABELS[cat]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Helper text */}
                <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                  {isAllSources && isAllCategories
                    ? 'Đang hiển thị tất cả nguồn và chủ đề'
                    : 'Bộ lọc đang hoạt động'}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      {!collapsed && (
        <div
          className="p-3 border-t text-[10px] flex items-center justify-between"
          style={{
            borderColor: 'var(--border-color)',
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
          }}
        >
          <span>Thiết kế KHDL</span>
          <span className="font-mono">v1.0</span>
        </div>
      )}
    </aside>
  );
}
