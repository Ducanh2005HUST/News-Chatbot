import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import { sendChatMessage, transcribeAudio } from '../api/chatApi';

/**
 * ChatWindow – main chat area with message list, input box,
 * loading spinner, and error display.
 */
export default function ChatWindow({ chatId, filters, messages, onMessagesChange }) {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    // --- STT states ---
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    // ------------------
    const scrollRef = useRef(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const shouldAutoScrollRef = useRef(true);
    const messagesRef = useRef(Array.isArray(messages) ? messages : []);

    const hasActiveFilters = (filters?.sources?.length ?? 0) > 0 || (filters?.categories?.length ?? 0) > 0;
    const safeMessages = Array.isArray(messages) ? messages : [];
    const isEmptyState = safeMessages.length === 1 && !isLoading;

    useEffect(() => {
        messagesRef.current = safeMessages;
    }, [safeMessages]);

    // Reset transient UI state when switching chat sessions.
    // (The chat session is identified by the message array changing dramatically.)
    useEffect(() => {
        setError(null);
        setIsLoading(false);
        setInput('');
        shouldAutoScrollRef.current = true;
    }, [chatId]);

    // Auto-scroll only if user is already near the bottom. This avoids layout "jumping"
    // when banners/toasts appear or when the user scrolls up to read older messages.
    useEffect(() => {
        if (!shouldAutoScrollRef.current) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    }, [safeMessages, isLoading]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    async function handleSend() {
        const question = input.trim();
        if (!question || isLoading) return;

        // Add user message
        const userMsg = {
            id: `user-${Date.now()}`,
            role: 'user',
            text: question,
            timestamp: _now(),
        };
        const nextAfterUser = [...messagesRef.current, userMsg];
        messagesRef.current = nextAfterUser;
        onMessagesChange && onMessagesChange(nextAfterUser);
        setInput('');
        setError(null);
        setIsLoading(true);

        try {
            const data = await sendChatMessage(question, {
                sources: filters.sources,
                categories: filters.categories,
            });

            const botMsg = {
                id: `bot-${Date.now()}`,
                role: 'bot',
                text: data.answer,
                sources: data.sources || [],
                intent: data.intent || 'simple',
                timestamp: _now(),
            };
            const nextAfterBot = [...messagesRef.current, botMsg];
            messagesRef.current = nextAfterBot;
            onMessagesChange && onMessagesChange(nextAfterBot);
        } catch (err) {
            setError(_formatError(err));
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    // ── Microphone / STT logic ────────────────────────────────────
    async function handleMicToggle() {
        // Nếu đang ghi âm -> dừng lại và gửi lên STT
        if (isRecording) {
            mediaRecorderRef.current?.stop();
            return;
        }

        // Xin quyền Mic
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            setError('Trình duyệt không thể truy cập Microphone. Hãy kiểm tra quyền truy cập.');
            return;
        }

        audioChunksRef.current = [];
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            // Dừng tất cả track mic
            stream.getTracks().forEach((t) => t.stop());
            setIsRecording(false);

            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            if (audioBlob.size < 1000) return; // quá ngắn, bỏ qua

            setIsTranscribing(true);
            try {
                const text = await transcribeAudio(audioBlob);
                if (text) {
                    setInput((prev) => prev ? `${prev} ${text}` : text);
                    inputRef.current?.focus();
                }
            } catch (err) {
                setError('Nhận dạng giọng nói thất bại. Vui lòng thử lại.');
                console.error('STT error:', err);
            } finally {
                setIsTranscribing(false);
            }
        };

        mediaRecorder.start();
        setIsRecording(true);
    }
    // ─────────────────────────────────────────────────────────────

    function handleScroll() {
        const el = scrollRef.current;
        if (!el) return;
        const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
        shouldAutoScrollRef.current = distanceToBottom < 120;
    }

    return (
        <div className="flex flex-col h-full relative">
            {/* ── Message list ──────────────────────────────────── */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-5 pb-28"
                id="chat-messages"
            >
                <div className="max-w-4xl mx-auto min-h-full flex flex-col">
                    <div className={`${isEmptyState ? 'flex-1 flex flex-col justify-center space-y-5 py-6' : 'space-y-5'}`}>
                        {hasActiveFilters && !isEmptyState && (
                            <div className="sticky top-3 z-10">
                                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] backdrop-blur-md px-4 py-2.5 shadow-[var(--shadow-sm)]">
                                    <p className="text-xs text-[var(--text-secondary)]">
                                        Đang áp dụng bộ lọc. Nếu kết quả quá ít, hãy thử bớt lọc ở Sidebar.
                                    </p>
                                </div>
                            </div>
                        )}

                        {hasActiveFilters && isEmptyState && (
                            <div className="animate-fadeInUp">
                                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] backdrop-blur-md px-4 py-2.5 shadow-[var(--shadow-sm)]">
                                    <p className="text-xs text-[var(--text-secondary)]">
                                        Đang áp dụng bộ lọc. Nếu kết quả quá ít, hãy thử bớt lọc ở Sidebar.
                                    </p>
                                </div>
                            </div>
                        )}

                        {safeMessages.map((msg) => (
                            <MessageBubble key={msg.id} message={msg} />
                        ))}

                        {/* Suggested prompts */}
                        {isEmptyState && (
                            <div className="animate-fadeInUp">
                                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                                    Gợi ý nhanh
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {SUGGESTED_QUESTIONS.map((q) => (
                                        <button
                                            key={q}
                                            type="button"
                                            onClick={() => {
                                                setInput(q);
                                                inputRef.current?.focus();
                                            }}
                                            className="text-sm px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] backdrop-blur-md hover:bg-[var(--bg-secondary)] transition-colors shadow-[var(--shadow-sm)] focus:ring-2 focus:ring-[var(--ring)]"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Loading indicator */}
                        {isLoading && (
                            <div className="flex justify-start animate-fadeInUp" id="loading-indicator">
                                <div className="bg-[var(--bg-elevated)] backdrop-blur-md border border-[var(--border-color)] rounded-2xl rounded-bl-md px-5 py-3.5 flex items-center gap-2 shadow-[var(--shadow-sm)]">
                                    <span className="typing-dot"></span>
                                    <span className="typing-dot"></span>
                                    <span className="typing-dot"></span>
                                    <span className="text-xs text-[var(--text-muted)] ml-2">Đang xử lý...</span>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>
            </div>

            {/* Error overlay (absolute so it never changes layout height) */}
            {error && (
                <div className="pointer-events-none absolute left-0 right-0 bottom-24 px-4 z-20">
                    <div className="max-w-4xl mx-auto">
                        <div
                            className="pointer-events-auto rounded-2xl border border-red-200 dark:border-red-800 bg-red-50/90 dark:bg-red-950/35 backdrop-blur-md px-4 py-3 shadow-[var(--shadow-sm)] flex items-start justify-between gap-3 animate-fadeInUp"
                            id="error-banner"
                        >
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                                    Không thể tải dữ liệu
                                </p>
                                <p className="text-xs text-red-700/80 dark:text-red-300/80 mt-0.5 break-words">
                                    {error}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setError(null)}
                                className="shrink-0 rounded-xl px-2 py-1 text-red-700/70 hover:text-red-700 dark:text-red-300/70 dark:hover:text-red-300 hover:bg-red-100/60 dark:hover:bg-red-900/30 transition-colors focus:ring-2 focus:ring-[var(--ring)]"
                                aria-label="Đóng thông báo lỗi"
                                title="Đóng"
                            >
                                x
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Input bar ─────────────────────────────────────── */}
            <div className="border-t border-[var(--border-color)] bg-[var(--bg-elevated)] backdrop-blur-md p-4 transition-theme">
                <div className="flex items-end gap-3 max-w-4xl mx-auto">
                    <textarea
                        ref={inputRef}
                        id="chat-input"
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Nhập câu hỏi về tin tức..."
                        disabled={isLoading || isTranscribing}
                        className="
              flex-1 resize-none px-4 py-3 rounded-2xl
              bg-[var(--bg-secondary)] text-[var(--text-primary)]
              border border-[var(--border-color)]
              placeholder:text-[var(--text-muted)]
              focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--accent)]
              disabled:opacity-50
              transition-theme text-sm leading-relaxed
              max-h-32
              shadow-[var(--shadow-sm)]
            "
                        onInput={(e) => {
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                        }}
                    />

                    {/* ── Nút Microphone ── */}
                    <button
                        id="mic-btn"
                        type="button"
                        onClick={handleMicToggle}
                        disabled={isLoading || isTranscribing}
                        title={isRecording ? 'Dừng ghi âm' : 'Ghi âm bằng giọng nói'}
                        aria-label={isRecording ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}
                        className={`
              px-3 py-3 rounded-2xl text-sm font-medium
              transition-all duration-200 active:scale-95
              shadow-[var(--shadow-sm)] focus:ring-2 focus:ring-[var(--ring)]
              disabled:opacity-40 disabled:cursor-not-allowed
              ${
                                isRecording
                                    ? 'bg-red-500 text-white animate-pulse'
                                    : isTranscribing
                                        ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)] cursor-wait'
                                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent)]'
                            }
            `}
                    >
                        {isTranscribing ? (
                            // Spinner khi đang transcribe
                            <span className="inline-block w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                        ) : (
                            // Icon mic SVG
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                        )}
                    </button>
                    <button
                        id="send-btn"
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="
              px-4 py-3 rounded-2xl font-semibold text-sm
              bg-[var(--accent)] text-white
              hover:bg-[var(--accent-hover)]
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200
              active:scale-95
              min-w-[72px]
              shadow-[var(--shadow-md)]
              focus:ring-2 focus:ring-[var(--ring)]
            "
                    >
                        {isLoading ? (
                            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <span className="inline-flex items-center gap-2">
                                Gửi
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M22 2L11 13" />
                                    <path d="M22 2L15 22l-4-9-9-4 20-7z" />
                                </svg>
                            </span>
                        )}
                    </button>
                </div>
                <div className="max-w-4xl mx-auto mt-2">
                    <p className="text-[10px] text-[var(--text-muted)]">
                        Trả lời được tạo từ dữ liệu crawl RSS và có thể sai sót. Hãy mở "Nguồn tham khảo" để đối chiếu.
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ── Helper ───────────────────────────────────────────────── */

function _now() {
    return new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

const SUGGESTED_QUESTIONS = [
    'Tổng hợp tin công nghệ mới nhất từ 3 báo',
    'Điểm tin kinh tế trong tuần qua',
    'Tin thế giới đáng chú ý nhất hôm nay là gì?',
    'Cho tôi các tin thể thao nổi bật gần đây',
];

function _formatError(err) {
    const raw = (err && typeof err === 'object' && 'message' in err) ? String(err.message) : '';
    const msg = raw.trim();

    if (!msg) return 'Không thể kết nối đến máy chủ. Vui lòng thử lại.';
    if (/load failed/i.test(msg)) return 'Kết nối thất bại. Vui lòng kiểm tra backend và thử lại.';
    if (/failed to fetch/i.test(msg)) return 'Không thể kết nối đến máy chủ. Vui lòng thử lại.';
    return msg;
}
