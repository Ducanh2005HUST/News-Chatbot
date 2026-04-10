import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import FinanceDashboard from './components/FinanceDashboard';
import {
    initStore,
    listChats,
    loadChatMessages,
    createChat,
    setActiveChat,
    renameChat,
    deleteChat,
    upsertChatMessages,
    exportChat,
    loadIndexOrNull,
} from './store/chatStore';

/**
 * App – root layout with dark/light toggle, sidebar, and chat window.
 */
export default function App() {
    const [dark, setDark] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme');
            if (saved) return saved === 'dark';
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });

    const [filters, setFilters] = useState({ sources: [], categories: [] });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const [chatIndex, setChatIndex] = useState(() => {
        if (typeof window === 'undefined') return null;
        return loadIndexOrNull();
    });
    const [activeMessages, setActiveMessages] = useState(() => WELCOME_MESSAGES);
const [activeTab, setActiveTab] = useState('chat');

    // Apply dark class to <html>
    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [dark]);

    // Initialize chat store once (and migrate legacy single-chat if present).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const idx = chatIndex ?? initStore({ welcomeMessages: WELCOME_MESSAGES });
        setChatIndex(idx);
        const activeId = idx.activeId ?? idx.chats?.[0]?.id;
        if (activeId) {
            const msgs = loadChatMessages(activeId, { welcomeMessages: WELCOME_MESSAGES });
            setActiveMessages(msgs);
        } else {
            setActiveMessages(WELCOME_MESSAGES);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const chats = chatIndex ? listChats(chatIndex) : [];
    const activeChatId = chatIndex?.activeId ?? null;

    function handleNewChat() {
        if (!chatIndex) return;
        const nextIndex = createChat(chatIndex, { welcomeMessages: WELCOME_MESSAGES });
        setChatIndex(nextIndex);
        setActiveMessages(WELCOME_MESSAGES);
    }

    function handleSelectChat(id) {
        if (!chatIndex) return;
        const nextIndex = setActiveChat(chatIndex, id);
        setChatIndex(nextIndex);
        const msgs = loadChatMessages(id, { welcomeMessages: WELCOME_MESSAGES });
        setActiveMessages(msgs);
    }

    function handleRenameChat(id, title) {
        if (!chatIndex) return;
        const nextIndex = renameChat(chatIndex, id, title);
        setChatIndex(nextIndex);
    }

    function handleDeleteChat(id) {
        if (!chatIndex) return;
        const nextIndex = deleteChat(chatIndex, id, { welcomeMessages: WELCOME_MESSAGES });
        setChatIndex(nextIndex);
        const nextActive = nextIndex.activeId;
        const msgs = nextActive
            ? loadChatMessages(nextActive, { welcomeMessages: WELCOME_MESSAGES })
            : WELCOME_MESSAGES;
        setActiveMessages(msgs);
    }

    function handleExportChat(id) {
        if (!chatIndex) return;
        const payload = exportChat(chatIndex, id);
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-${(payload.chat?.title ?? 'doan-chat').toString().slice(0, 32).replace(/\s+/g, '-')}-${new Date()
            .toISOString()
            .replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function handleMessagesChange(nextMessages) {
        setActiveMessages(nextMessages);
        if (!chatIndex || !activeChatId) return;
        const nextIndex = upsertChatMessages(chatIndex, activeChatId, nextMessages);
        setChatIndex(nextIndex);
    }

    return (
        <div
            className="h-screen flex bg-[var(--bg-primary)] text-[var(--text-primary)] transition-theme overflow-hidden relative"
            id="app-root"
        >
            <BackgroundDecor />

            {/* ── Sidebar ───────────────────────────────────────── */}
            <Sidebar
                filters={filters}
                onFiltersChange={setFilters}
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed((p) => !p)}
                chats={chats}
                activeChatId={activeChatId}
                onNewChat={handleNewChat}
                onSelectChat={handleSelectChat}
                onRenameChat={handleRenameChat}
                onDeleteChat={handleDeleteChat}
                onExportChat={handleExportChat}
            />

            {/* ── Main area ─────────────────────────────────────── */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header
                    className="h-14 flex items-center justify-between px-4 border-b border-[var(--border-color)] bg-[var(--bg-elevated)] backdrop-blur-md transition-theme flex-shrink-0"
                    id="top-bar"
                >
                    <div className="flex items-center gap-3">
                        {/* Sidebar toggle */}
                        <button
                            id="sidebar-toggle-btn"
                            onClick={() => setSidebarCollapsed((p) => !p)}
                            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors focus:ring-2 focus:ring-[var(--ring)]"
                            aria-label="Toggle sidebar"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        </button>

                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/15 flex items-center justify-center shadow-[var(--shadow-sm)]">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H6a2 2 0 0 1-2-2V7z" />
                                    <path d="M8 9h8" />
                                    <path d="M8 13h6" />
                                </svg>
                            </div>
                            <div className="leading-tight">
                                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                                    Chatbot Tin tức RAG
                                </h2>
                                <p className="text-[10px] text-[var(--text-muted)]">
                                    Trợ lý hỏi đáp tin tức
                                </p>
                            </div>
                        </div>

                        <FilterPills filters={filters} onClear={() => setFilters({ sources: [], categories: [] })} />
                    </div>

                    {/* Dark mode toggle */}
                    <button
                        id="theme-toggle-btn"
                        onClick={() => setDark((d) => !d)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors focus:ring-2 focus:ring-[var(--ring)]"
                        aria-label="Toggle theme"
                    >
                        {dark ? (
                            /* Sun icon */
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="5" />
                                <line x1="12" y1="1" x2="12" y2="3" />
                                <line x1="12" y1="21" x2="12" y2="23" />
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                <line x1="1" y1="12" x2="3" y2="12" />
                                <line x1="21" y1="12" x2="23" y2="12" />
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                            </svg>
                        ) : (
                            /* Moon icon */
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                            </svg>
                        )}
                    </button>
                </header>

                {/* Chat content */}
                <div className="flex-1 min-h-0">
                    <ChatWindow
                        filters={filters}
                        chatId={activeChatId}
                        messages={activeMessages}
                        onMessagesChange={handleMessagesChange}
                    />
                </div>
            </main>
        </div>
    );
}

function FilterPills({ filters, onClear }) {
    const sources = filters.sources ?? [];
    const categories = filters.categories ?? [];
    const isAll = sources.length === 0 && categories.length === 0;

    return (
        <div className="hidden md:flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-muted)]">Lọc:</span>
            <span
                className={`
          text-[10px] px-2 py-0.5 rounded-full border
          ${sources.length === 0
                        ? 'border-[var(--border-color)] text-[var(--text-muted)]'
                        : 'border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent)]'
                    }
        `}
                title={sources.length === 0 ? 'Tất cả nguồn' : sources.join(', ')}
            >
                {sources.length === 0 ? 'Tất cả nguồn' : `${sources.length} nguồn`}
            </span>
            <span
                className={`
          text-[10px] px-2 py-0.5 rounded-full border
          ${categories.length === 0
                        ? 'border-[var(--border-color)] text-[var(--text-muted)]'
                        : 'border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent)]'
                    }
        `}
                title={categories.length === 0 ? 'Tất cả chủ đề' : categories.join(', ')}
            >
                {categories.length === 0 ? 'Tất cả chủ đề' : `${categories.length} chủ đề`}
            </span>

            {!isAll && (
                <button
                    type="button"
                    onClick={onClear}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors focus:ring-2 focus:ring-[var(--ring)]"
                    title="Xóa tất cả bộ lọc"
                >
                    Xóa lọc
                </button>
            )}
        </div>
    );
}

function BackgroundDecor() {
    // Decorative shapes to complement the CSS gradient background.
    return (
        <>
            <div
                className="pointer-events-none absolute -top-24 -left-28 w-[520px] h-[520px] rounded-full blur-3xl opacity-25"
                style={{ background: 'radial-gradient(circle at 30% 30%, var(--accent) 0%, transparent 62%)' }}
                aria-hidden="true"
            />
            <div
                className="pointer-events-none absolute -bottom-40 -right-40 w-[680px] h-[680px] rounded-full blur-3xl opacity-20"
                style={{ background: 'radial-gradient(circle at 40% 40%, rgba(16,185,129,0.9) 0%, transparent 62%)' }}
                aria-hidden="true"
            />
            <div
                className="pointer-events-none absolute top-1/3 -right-56 w-[520px] h-[520px] rounded-full blur-3xl opacity-15"
                style={{ background: 'radial-gradient(circle at 50% 50%, rgba(245,158,11,0.85) 0%, transparent 66%)' }}
                aria-hidden="true"
            />
        </>
    );
}

const WELCOME_MESSAGES = [
    {
        id: 'welcome',
        role: 'bot',
        text: 'Xin chào! Tôi là trợ lý đọc báo thông minh. Bạn có thể hỏi tôi về tin tức từ VnExpress, Tuổi Trẻ, và Thanh Niên.\n\nVí dụ: "Tin tức công nghệ mới nhất?" hoặc "Tổng hợp tình hình kinh tế tuần qua?"',
        sources: [],
        intent: 'simple',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    },
];
