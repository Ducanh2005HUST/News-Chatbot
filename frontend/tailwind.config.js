/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Cool Professional Newspaper Palette
                primary: {
                    50: '#e8f1f8',
                    100: '#d1e3f0',
                    200: '#a8c8e3',
                    300: '#7aadd6',
                    400: '#4d91c9',
                    500: '#2e76b3',
                    600: '#1e5a92',
                    700: '#164876',
                    800: '#123b60',
                    900: '#0f2f4c',
                    950: '#0a1628', // Deep navy
                },
                accent: {
                    50: '#e6f6ff',
                    100: '#ccebff',
                    200: '#99d6ff',
                    300: '#66c2ff',
                    400: '#33adff',
                    500: '#00a8e8', // Arctic blue - primary accent
                    600: '#008dc4',
                    700: '#0072a0',
                    800: '#00587d',
                    900: '#003f5a',
                },
                surface: {
                    50: '#f8fafc', // Paper white
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a', // Rich navy
                    950: '#020617',
                },
            },
            fontFamily: {
                // Display font for headlines and hero sections
                display: ['"Playfair Display"', 'Georgia', 'serif'],
                // Body font for readability
                body: ['"Inter"', '"Be Vietnam Pro"', 'system-ui', '-apple-system', 'sans-serif'],
                // Monospace for code and data
                mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
            },
            borderRadius: {
                'xs': '2px',
                'sm': '4px',
                'md': '8px',
                'lg': '12px',
                'xl': '16px',
                '2xl': '24px',
            },
            boxShadow: {
                'subtle': '0 1px 3px rgba(10, 22, 40, 0.08)',
                'sm': '0 2px 6px rgba(10, 22, 40, 0.10)',
                'md': '0 4px 12px rgba(10, 22, 40, 0.12)',
                'lg': '0 8px 24px rgba(10, 22, 40, 0.15)',
                'accent': '0 4px 16px rgba(0, 168, 232, 0.25)',
            },
            spacing: {
                '18': '4.5rem',
                '22': '5.5rem',
            },
            fontSize: {
                'caption': ['0.75rem', { lineHeight: '1.5' }],
                'display-sm': ['2rem', { lineHeight: '1.3', fontFamily: 'display' }],
                'display-md': ['2.5rem', { lineHeight: '1.2', fontFamily: 'display' }],
                'display-lg': ['3rem', { lineHeight: '1.2', fontFamily: 'display' }],
            },
        },
    },
    plugins: [],
}
