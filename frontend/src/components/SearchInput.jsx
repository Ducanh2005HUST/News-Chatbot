import { useState, useEffect } from 'react';

export default function SearchInput({ value, onChange, placeholder = "Search chats..." }) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="relative mb-4">
      <div
        className={`absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none transition-colors duration-200 ${
          isFocused ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
        }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-3 text-sm bg-[var(--bg-secondary)] border-b-2 border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-200 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)] outline-none"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          aria-label="Clear search"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
