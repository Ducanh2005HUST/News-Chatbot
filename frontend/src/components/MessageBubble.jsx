import SourceCard from './SourceCard';

export default function MessageBubble({ message }) {
    const isUser = message.role === 'user';
    const lines = message.text.split('\n');

    return (
        <div
            className={`animate-fadeInUp flex ${isUser ? 'justify-end' : 'justify-start'}`}
            id={`message-${message.id}`}
        >
            <div className={`${isUser ? 'max-w-[70%]' : 'max-w-[85%]'}`}>
                {/* Bubble */}
                <div
                    className={`rounded-lg px-4 py-3 leading-relaxed text-sm transition-theme shadow-sm ${
                        isUser
                            ? 'bg-[var(--accent)] text-white rounded-tl-lg rounded-br-lg py-3 px-4 shadow-md'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-l-2 border-[var(--accent)] py-4 px-4'
                    }`}
                >
                    {lines.map((line, i) => (
                        <span key={i}>
                            {isUser ? line : <LinkifiedText text={line} />}
                            {i < lines.length - 1 && <br />}
                        </span>
                    ))}
                </div>

                {/* Intent badge for multi-source */}
                {!isUser && message.intent === 'multi_source' && (
                    <div className="mt-1.5 ml-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15 font-semibold uppercase tracking-wide">
                            Tổng hợp nhiều nguồn
                        </span>
                    </div>
                )}

                {/* Source cards */}
                {!isUser && message.sources && message.sources.length > 0 && (
                    <div className="mt-3 space-y-2">
                        <p className="text-[10px] font-semibold text-[var(--text-muted)] ml-1 tracking-wide uppercase">
                            Nguồn tham khảo
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                            {message.sources.map((src, idx) => (
                                <SourceCard key={idx} source={src} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Timestamp */}
                <p className={`text-[10px] mt-1.5 text-[var(--text-muted)] ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
                    {message.timestamp}
                </p>
            </div>
        </div>
    );
}

function LinkifiedText({ text }) {
    const parts = text.split(/(\s+)/);
    return parts.map((part, idx) => {
        if (/^https?:\/\/\S+$/i.test(part)) {
            const cleanUrl = part.replace(/[),.;]+$/g, '');
            const trailing = part.slice(cleanUrl.length);
            return (
                <span key={idx}>
                    <a
                        href={cleanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 decoration-[var(--text-muted)] hover:decoration-[var(--accent)] text-[var(--accent)]"
                    >
                        {cleanUrl}
                    </a>
                    {trailing}
                </span>
            );
        }
        return <span key={idx}>{part}</span>;
    });
}
