import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        canvas: '#F6F8FA',
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#F9FAFB',
          muted: '#F1F4F8',
        },
        border: {
          DEFAULT: '#E2E7EE',
          subtle: '#EDF1F5',
          strong: '#CBD5E1',
        },
        navy: {
          DEFAULT: '#172B4D',
          secondary: '#42526E',
          muted: '#6B778C',
          interactive: '#1E4E8C',
        },
        status: {
          success: '#168568',
          'success-bg': '#ECF7F3',
          'success-border': '#B8E2D4',
          warning: '#D69A35',
          'warning-bg': '#FDF7EB',
          'warning-border': '#F1DBA8',
          danger: '#D9534F',
          'danger-bg': '#FDF1F1',
          'danger-border': '#F3C2C0',
          info: '#1E4E8C',
          'info-bg': '#EFF4FB',
          'info-border': '#C5D7EE',
        },
      },
      borderRadius: {
        card: '8px',
        control: '6px',
        badge: '4px',
      },
      boxShadow: {
        popover: '0 4px 12px rgba(23, 43, 77, 0.08), 0 1px 2px rgba(23, 43, 77, 0.04)',
      },
    },
  },
  plugins: [],
}

export default config

