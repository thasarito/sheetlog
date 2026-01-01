import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#0f172a'
        }
      },
      boxShadow: {
        soft: '0 12px 30px -16px rgba(15, 23, 42, 0.5)'
      }
    }
  },
  plugins: []
};

export default config;
