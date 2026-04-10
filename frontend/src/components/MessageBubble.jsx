import { useState } from 'react';
import SourceCard from './SourceCard';

/**
 * MessageBubble – renders a single chat message (user or bot).
 * Bot messages support basic markdown rendering.
 */
export default function MessageBubble({ message }) {
    const isUser = message.role === 'user';

    return (
        <div
            className={`animate-fadeInUp flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            id={`message-${message.id}`}
        >
            {/* Avatar */}
            <div className="flex-shrink-0 mt-0.5">
                {isUser ? (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-500 flex items-center justify-center shadow-[var(--shadow-sm)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </div>
                ) : (
                    <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20 flex items-center justify-center shadow-[var(--shadow-sm)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2a9 9 0 0 1 9 9 9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9z" />
                            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                            <line x1="9" y1="9" x2="9.01" y2="9" />
                            <line x1="15" y1="9" x2="15.01" y2="9" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Content column */}
            <div className={`flex flex-col gap-1.5 max-w-[80%] md:max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Role label */}
                <p className="text-[10px] font-semibold text-[var(--text-muted)] px-1">
                    {isUser ? 'Bạn' : 'Trợ lý AI'}
                </p>

                {/* Bubble */}
                {isUser ? (
                    <div
                        className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed text-white shadow-[var(--shadow-md)]"
                        style={{ background: 'var(--user-bubble)' }}
                    >
                        {message.text}
                    </div>
                ) : (
                    <div
                        className="px-4 py-3.5 rounded-2xl rounded-tl-sm border border-[var(--border-color)] shadow-[var(--shadow-sm)] transition-theme w-full"
                        style={{ background: 'var(--bot-bubble)' }}
                    >
                        <BotContent text={message.text} />
                    </div>
                )}

                {/* Intent badge */}
                {!isUser && message.intent === 'multi_source' && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20 font-semibold shadow-[var(--shadow-xs)]">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>
                        </svg>
                        Tổng hợp nhiều nguồn
                    </span>
                )}

                {/* Source cards */}
                {!isUser && message.sources && message.sources.length > 0 && (
                    <SourcesAccordion sources={message.sources} />
                )}

                {/* Timestamp */}
                <p className={`text-[10px] text-[var(--text-muted)] px-1 ${isUser ? 'text-right' : 'text-left'}`}>
                    {message.timestamp}
                </p>
            </div>
        </div>
    );
}

/* ─── Bot prose content with basic markdown ───────────────── */
function BotContent({ text }) {
    // Parse basic markdown: **bold**, *italic*, `code`, # headers, bullets, numbered, blockquote
    const lines = text.split('\n');
    const elements = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Blank line – separator
        if (!line.trim()) { i++; continue; }

        // Heading
        const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const Tag = `h${level}`;
            const sizes = { 1: 'text-base', 2: 'text-sm', 3: 'text-sm' };
            elements.push(
                <Tag key={key++} className={`font-bold mt-2 mb-0.5 text-[var(--text-primary)] ${sizes[level]}`}>
                    <InlineMarkdown text={headingMatch[2]} />
                </Tag>
            );
            i++;
            continue;
        }

        // Blockquote
        if (line.startsWith('> ')) {
            elements.push(
                <blockquote key={key++} className="border-l-2 border-[var(--accent)] pl-3 text-[var(--text-secondary)] italic text-sm my-1">
                    <InlineMarkdown text={line.slice(2)} />
                </blockquote>
            );
            i++;
            continue;
        }

        // Unordered list – collect consecutive items
        if (line.match(/^[-*] /)) {
            const items = [];
            while (i < lines.length && lines[i].match(/^[-*] /)) {
                items.push(<li key={i} className="my-0.5"><InlineMarkdown text={lines[i].slice(2)} /></li>);
                i++;
            }
            elements.push(<ul key={key++} className="list-disc pl-5 my-1 space-y-0.5 text-sm">{items}</ul>);
            continue;
        }

        // Ordered list – collect consecutive items
        if (line.match(/^\d+\. /)) {
            const items = [];
            while (i < lines.length && lines[i].match(/^\d+\. /)) {
                const content = lines[i].replace(/^\d+\. /, '');
                items.push(<li key={i} className="my-0.5"><InlineMarkdown text={content} /></li>);
                i++;
            }
            elements.push(<ol key={key++} className="list-decimal pl-5 my-1 space-y-0.5 text-sm">{items}</ol>);
            continue;
        }

        // Normal paragraph
        elements.push(
            <p key={key++} className="text-sm leading-relaxed mb-0.5">
                <InlineMarkdown text={line} />
            </p>
        );
        i++;
    }

    return <div className="bot-prose space-y-0.5">{elements}</div>;
}

/* ─── Inline markdown: **bold**, *italic*, `code`, links ──── */
function InlineMarkdown({ text }) {
    // Split on bold (**), italic (*), code (`) and URLs
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/\S+)/g;
    const parts = [];
    let last = 0;
    let match;
    let idx = 0;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > last) parts.push(<span key={idx++}>{text.slice(last, match.index)}</span>);
        const token = match[0];
        if (token.startsWith('**')) {
            parts.push(<strong key={idx++} className="font-semibold text-[var(--accent)]">{token.slice(2, -2)}</strong>);
        } else if (token.startsWith('*')) {
            parts.push(<em key={idx++} className="italic text-[var(--text-secondary)]">{token.slice(1, -1)}</em>);
        } else if (token.startsWith('`')) {
            parts.push(
                <code key={idx++} className="text-[0.8em] bg-[var(--bg-tertiary)] border border-[var(--border-color)] px-1 py-0.5 rounded text-[var(--accent)] font-mono">
                    {token.slice(1, -1)}
                </code>
            );
        } else {
            const clean = token.replace(/[),.;]+$/, '');
            const trail = token.slice(clean.length);
            parts.push(
                <span key={idx++}>
                    <a href={clean} target="_blank" rel="noopener noreferrer"
                        className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-hover)] break-all">
                        {clean}
                    </a>
                    {trail}
                </span>
            );
        }
        last = match.index + token.length;
    }
    if (last < text.length) parts.push(<span key={idx++}>{text.slice(last)}</span>);
    return parts.length ? <>{parts}</> : <>{text}</>;
}

/* ─── Sources collapsible section ─────────────────────────── */
function SourcesAccordion({ sources }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="w-full">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors group"
            >
                <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                >
                    <path d="M9 18l6-6-6-6" />
                </svg>
                {sources.length} nguồn tham khảo
            </button>

            {open && (
                <div className="mt-2 grid grid-cols-1 gap-2 animate-fadeInUp">
                    {sources.map((src, idx) => (
                        <SourceCard key={idx} source={src} />
                    ))}
                </div>
            )}
        </div>
    );
}
