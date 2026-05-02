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
        panel: '#11171d',
        panel2: '#151c23',
        line: 'rgba(255,255,255,0.08)',
        accent: '#2dd4bf',
      },
      boxShadow: {
        soft: '0 18px 60px -34px rgba(0, 0, 0, 0.75)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
