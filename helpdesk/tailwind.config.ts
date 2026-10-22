import type { Config } from 'tailwindcss';

/**
 * Única fonte de verdade visual. Os mesmos valores existem como variáveis CSS em
 * `src/index.css` (:root). `src/lib/tokens.test.ts` falha se os dois divergirem.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      colors: {
        fg: { DEFAULT: '#293239', muted: '#5C6970', subtle: '#848F99', inverse: '#FFFFFF' },
        line: { DEFAULT: '#D8DCDE', strong: '#B0B8BE' },
        surface: { DEFAULT: '#FFFFFF', 1: '#F8F9F9', 2: '#E8EAEC' },
        hover: 'rgba(92,105,112,0.08)',
        action: { DEFAULT: '#1F73B7', hover: '#17598D', soft: '#E8F1F8' },
        ink: { DEFAULT: '#39434B', active: '#293239' },
        note: { bg: '#FFF3E4', badge: '#FCA347', badgeText: '#4C2C17' },
        bubble: { customer: '#ECF9F9' },
        sla: {
          bg: '#DAEDED',
          text: '#104B35',
          warn: '#FFF1D6',
          warnText: '#7A4B00',
          breach: '#FBE3E5',
          breachText: '#8F1F2B',
        },
        danger: '#CC3340',
        ai: '#8E5FD1',
        status: { new: '#F5A04A', open: '#CC3340', hold: '#8F2A35', pending: '#1F73B7', solved: '#39434B' },
      },
      fontSize: {
        '2xs': ['10px', '12px'],
        xs: ['12px', '16px'],
        sm: ['14px', '18px'],
        md: ['16px', '22px'],
        xl: ['22px', '28px'],
        '2xl': ['26px', '32px'],
      },
      borderRadius: { xs: '2px', DEFAULT: '4px', lg: '8px', pill: '100px' },
      boxShadow: {
        pop: '0 4px 8px rgba(10,13,14,0.16)',
        menu: '0 20px 24px rgba(10,13,14,0.16)',
        focus: '0 0 0 3px rgba(31,115,183,0.28)',
      },
      spacing: {
        rail: '56px',
        rail2: '48px',
        props: '309px',
        right: '380px',
        topbar: '48px',
        bottombar: '50px',
      },
    },
  },
  plugins: [],
} satisfies Config;
