import { useState, useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import { sendChatMessage, transcribeAudio } from '../api/chatApi';

const SUGGESTED_QUESTIONS = [
    { icon: '💻', text: 'Tin công nghệ mới nhất từ 3 báo' },
    { icon: '📈', text: 'Điểm tin kinh tế trong tuần qua' },
    { icon: '🌏', text: 'Tin thế giới đáng chú ý hôm nay' },
    { icon: '⚽', text: 'Tổng hợp tin thể thao nổi bật' },
];

export default function ChatWindow({ chatId, filters, messages, onMessagesChange }) {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [useStreaming, setUseStreaming] = useState(true); // Enable streaming by default
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

    useEffect(() => { messagesRef.current = safeMessages; }, [safeMessages]);

    useEffect(() => {
        setError(null);
        setIsLoading(false);
        setInput('');
        shouldAutoScrollRef.current = true;
    }, [chatId]);

    useEffect(() => {
        if (!shouldAutoScrollRef.current) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [safeMessages, isLoading]);

    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 50);
    }, []);

    async function handleSend() {
        const question = input.trim();
        if (!question || isLoading) return;

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
            if (useStreaming) {
                // Streaming mode
                const botMsgId = `bot-${Date.now()}`;
                const botMsg = {
                    id: botMsgId,
                    role: 'bot',
                    text: '',
                    sources: [],
                    intent: 'simple', // will be updated in onDone
                    timestamp: _now(),
                    isStreaming: true,
                };
                const nextWithBot = [...messagesRef.current, botMsg];
                messagesRef.current = nextWithBot;
                onMessagesChange && onMessagesChange(nextWithBot);

                await sendChatMessage(
                    question,
                    {
                        sources: filters.sources,
                        categories: filters.categories,
                    },
                    true, // stream = true
                    (token) => {
                        // onToken: append token to bot message
                        const msgs = messagesRef.current;
                        const idx = msgs.findIndex(m => m.id === botMsgId);
                        if (idx !== -1) {
                            msgs[idx].text += token;
                            onMessagesChange && onMessagesChange([...msgs]);
                            // Auto-scroll
                            setTimeout(() => {
                                if (messagesEndRef.current) {
                                    messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                                }
                            }, 0);
                        }
                    },
                    (done) => {
                        // onDone: finalize bot message
                        const msgs = messagesRef.current;
                        const idx = msgs.findIndex(m => m.id === botMsgId);
                        if (idx !== -1) {
                            msgs[idx] = {
                                ...msgs[idx],
                                ...done,
                                isStreaming: false,
                            };
                            onMessagesChange && onMessagesChange([...msgs]);
                        }
                        setIsLoading(false);
                        setTimeout(() => inputRef.current?.focus(), 50);
                    }
                );
            } else {
                // Non-streaming mode
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
                    isStreaming: false,
                };
                const nextAfterBot = [...messagesRef.current, botMsg];
                messagesRef.current = nextAfterBot;
                onMessagesChange && onMessagesChange(nextAfterBot);
                setIsLoading(false);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        } catch (err) {
            setError(_formatError(err));
            setIsLoading(false);
            setTimeout(() => inputRef.current?.focus(), 50);
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
        shouldAutoScrollRef.current = el.scrollHeight - (el.scrollTop + el.clientHeight) < 120;
    }

    return (
        <div className="flex flex-col h-full relative">
            {/* ── Message list ── */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-6 pb-32"
                id="chat-messages"
            >
                <div className="max-w-3xl mx-auto min-h-full flex flex-col">
                    <div className={`${isEmptyState ? 'flex-1 flex flex-col justify-center space-y-6 py-8' : 'space-y-6'}`}>

                        {/* Filter notice */}
                        {hasActiveFilters && !isEmptyState && (
                            <div className="sticky top-2 z-10 animate-fadeInUp">
                                <div className="glass-card rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-[var(--shadow-sm)]">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                                    <p className="text-xs text-[var(--text-secondary)]">Đang lọc theo nguồn / chủ đề đã chọn.</p>
                                </div>
                            </div>
                        )}

                        {safeMessages.map((msg) => (
                            <MessageBubble key={msg.id} message={msg} />
                        ))}

                        {/* Empty-state: suggested prompts */}
                        {isEmptyState && (
                            <div className="animate-fadeInUp space-y-4">
                                {hasActiveFilters && (
                                    <div className="glass-card rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-[var(--shadow-sm)]">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                                        <p className="text-xs text-[var(--text-secondary)]">Đang lọc theo nguồn / chủ đề đã chọn.</p>
                                    </div>
                                )}

                                <div>
                                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3 px-1">
                                        ✨ Gợi ý nhanh
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {SUGGESTED_QUESTIONS.map((q) => (
                                            <button
                                                key={q.text}
                                                type="button"
                                                onClick={() => { setInput(q.text); inputRef.current?.focus(); }}
                                                className="flex items-center gap-3 text-left px-4 py-3.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] hover:border-[var(--accent)]/30 hover:shadow-[var(--shadow-md)] transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-[var(--ring)] shadow-[var(--shadow-xs)]"
                                            >
                                                <span className="text-xl leading-none">{q.icon}</span>
                                                <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors font-medium">{q.text}</span>
                                                <svg className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Loading indicator */}
                        {isLoading && (
                            <div className="flex gap-3 animate-fadeInUp" id="loading-indicator">
                                {/* Bot avatar */}
                                <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20 flex items-center justify-center">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2a9 9 0 0 1 9 9 9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9z"/>
                                        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                                        <line x1="9" y1="9" x2="9.01" y2="9"/>
                                        <line x1="15" y1="9" x2="15.01" y2="9"/>
                                    </svg>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <p className="text-[10px] font-semibold text-[var(--text-muted)]">Trợ lý AI</p>
                                    <div className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2 shadow-[var(--shadow-sm)]">
                                        <span className="typing-dot" />
                                        <span className="typing-dot" />
                                        <span className="typing-dot" />
                                        <span className="text-xs text-[var(--text-muted)] ml-1">Đang phân tích và tìm kiếm...</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>
            </div>

            {/* ── Error toast ── */}
            {error && (
                <div className="pointer-events-none absolute left-0 right-0 bottom-28 px-4 z-20">
                    <div className="max-w-3xl mx-auto">
                        <div className="pointer-events-auto glass-card rounded-2xl border border-red-200/60 dark:border-red-800/50 bg-red-50/90 dark:bg-red-950/40 px-4 py-3 shadow-[var(--shadow-md)] flex items-start justify-between gap-3 animate-fadeInUp" id="error-banner">
                            <div className="flex items-start gap-2.5 min-w-0">
                                <div className="mt-0.5 w-5 h-5 rounded-full bg-red-500 flex-shrink-0 flex items-center justify-center">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">Không thể tải dữ liệu</p>
                                    <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">{error}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setError(null)} className="shrink-0 p-1.5 rounded-xl hover:bg-red-100/60 dark:hover:bg-red-900/30 text-red-400 hover:text-red-600 transition-colors" aria-label="Đóng">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
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
                    {/* Streaming toggle */}
                    <div className="flex flex-col gap-1 pb-3">
                        <label className="flex items-center gap-2 cursor-pointer" title="Bật/tắt streaming (tự động hiển thị từng chữ)">
                            <input
                                type="checkbox"
                                checked={useStreaming}
                                onChange={(e) => setUseStreaming(e.target.checked)}
                                className="rounded border-gray-300 dark:border-gray-600 accent-[var(--accent)]"
                            />
                            <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">Streaming</span>
                        </label>
                    </div>

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

function _now() {
    return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function _formatError(err) {
    const raw = (err && typeof err === 'object' && 'message' in err) ? String(err.message) : '';
    const msg = raw.trim();
    if (!msg) return 'Không thể kết nối đến máy chủ. Vui lòng thử lại.';
    if (/load failed/i.test(msg)) return 'Kết nối thất bại. Vui lòng kiểm tra backend và thử lại.';
    if (/failed to fetch/i.test(msg)) return 'Không thể kết nối đến máy chủ. Vui lòng thử lại.';
    return msg;
}
