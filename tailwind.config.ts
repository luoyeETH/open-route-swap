import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-geist-sans)',
          'Geist',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'var(--font-geist-mono)',
          'Geist Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      colors: {
        ink: '#0b0f14',
        panel: '#141a22',
        panel2: '#1a2130',
        surface: '#141a22',
        'surface-hover': '#1a2130',
        line: 'rgba(255,255,255,0.1)',
        accent: '#2dd4bf',
      },
      boxShadow: {
        soft: '0 4px 16px -4px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
};

export default config;
