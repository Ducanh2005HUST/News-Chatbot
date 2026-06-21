import PropTypes from 'prop-types';

export default function WelcomeBanner({ suggestions, onSuggestionClick }) {
  const defaultSuggestions = [
    { id: 1, text: 'Tin tức công nghệ hôm nay?', icon: '💻' },
    { id: 2, text: 'Tin tức kinh tế trong tuần?', icon: '📊' },
    { id: 3, text: 'So sánh tin từ VnExpress?', icon: '📰' },
    { id: 4, text: 'Giá xăng có thay đổi không?', icon: '⛽' },
  ];

  const suggestionsToShow = suggestions || defaultSuggestions;

  return (
    <div className="welcome-banner animate-fadeUp py-12 px-6 text-center">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          ✉️ Hỏi đáp tin tức Việt Nam
        </h1>
        <p className="text-base mb-8" style={{ color: 'var(--text-muted)' }}>
          Dựa trên 3 nguồn tin tức hàng đầu
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {suggestionsToShow.map((suggestion) => (
            <button
              key={suggestion.id}
              onClick={() => onSuggestionClick(suggestion.text)}
              className="suggestion-card text-left p-4 rounded-lg bg-[var(--bg-secondary)] border-[var(--border-color)] hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0" role="img" aria-hidden="true">
                  {suggestion.icon || '📋'}
                </span>
                <span
                  className="text-sm md:text-base font-medium leading-relaxed"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {suggestion.text}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-center gap-4 text-[var(--text-muted)] text-sm">
          <div className="h-px w-16 bg-[var(--border-color)]" />
          <span>hoặc nhập câu hỏi của bạn</span>
          <div className="h-px w-16 bg-[var(--border-color)]" />
        </div>
      </div>

      <style jsx>{`
        .welcome-banner {
          animation: fadeInUp 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}

WelcomeBanner.propTypes = {
  suggestions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      text: PropTypes.string.isRequired,
      icon: PropTypes.string,
    })
  ),
  onSuggestionClick: PropTypes.func.isRequired,
};
