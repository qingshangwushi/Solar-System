/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 深空主题
        space: {
          900: '#03050a',
          800: '#0a0e17',
          700: '#121826',
          600: '#1a2238',
          500: '#243049',
          400: '#364566',
        },
        accent: {
          DEFAULT: '#5b8cff',
          dim: '#3a5ba0',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Noto Sans SC', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
