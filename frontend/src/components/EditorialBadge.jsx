import { useState, useEffect } from 'react';

/**
 * EditorialBadge - Animated counter showing total articles processed
 * Displays: "📈 X,XXX tin từ 3 nguồn"
 * With subtle pulse animation on the icon
 */
export default function EditorialBadge({ count }) {
  const [displayCount, setDisplayCount] = useState(0);

  useEffect(() => {
    // Reset when count changes
    setDisplayCount(0);

    // Animate count up over 2 seconds
    const duration = 2000;
    const steps = 60;
    const increment = count / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current += increment;
      if (step >= steps) {
        setDisplayCount(count);
        clearInterval(timer);
      } else {
        setDisplayCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [count]);

  // Format number with commas
  const formattedCount = displayCount.toLocaleString('vi-VN');

  return (
    <div className="newsroom-pulse-badge flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-soft border border-accent/20">
      <span
        className="text-lg animate-pulse-slow"
        role="img"
        aria-label="Pulse icon"
        style={{ color: 'var(--accent)' }}
      >
        📈
      </span>
      <span className="font-mono text-xs font-medium" style={{ color: 'var(--accent)' }}>
        {formattedCount} tin từ 3 nguồn
      </span>
      <style jsx>{`
        .newsroom-pulse-badge {
          animation: fadeInUp 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
