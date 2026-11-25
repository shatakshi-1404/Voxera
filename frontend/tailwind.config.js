const c = (v) => `rgb(var(--${v}) / <alpha-value>)`
/** Voxera design tokens live in src/index.css (CSS variables); Tailwind maps them here. */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), surface: c('surface'), line: c('line'), ink: c('ink'), muted: c('muted'), faint: c('faint'),
        accent: c('accent'), accent2: c('accent2'), mint: c('mint'), soft: c('soft'), tint: c('tint'),
        warn: c('warn'), danger: c('danger'), 'on-accent': c('on-accent'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
      boxShadow: {
        card: '0 1px 0 rgb(255 255 255 / 0.03) inset, 0 8px 30px -12px rgb(0 0 0 / 0.35)',
        pop: '0 24px 60px -12px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(var(--line))',
        glow: '0 8px 28px -8px rgb(var(--accent) / 0.55)',
      },
      transitionDuration: { fast: '150ms', base: '220ms', slow: '320ms' },
      transitionTimingFunction: { voxera: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
      },
      animation: { float: 'float 7s ease-in-out infinite' },
    },
  },
  plugins: [],
}
