/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14213D', soft: '#4A5672', faint: '#8A93A6' },
        paper: { DEFAULT: '#F1F5F2', deep: '#E3EBE6' },
        line: '#D1D5DB', // <--- Added this to fix the border-line error
        teal: { DEFAULT: '#1F6F5C', dark: '#16503F', light: '#D6E9E2' },
        saffron: { DEFAULT: '#F2A33A', dark: '#B86F0E', light: '#FDEBD0' },
        danger: { DEFAULT: '#C2362B', light: '#F8DEDB' },
        safe: { DEFAULT: '#2E7D4F', light: '#DCEFE3' },
        unsure: { DEFAULT: '#6B5BA8', light: '#E7E3F4' },
      },
      fontFamily: {
        sans: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
        urdu: ['"Noto Nastaliq Urdu"', '"Atkinson Hyperlegible"', 'serif'],
      },
      fontSize: {
        // modular scale, ratio ~1.25, base 18px for low-vision readers
        sm: ['0.889rem', '1.45'], base: ['1rem', '1.55'], lg: ['1.25rem', '1.45'],
        xl: ['1.563rem', '1.3'], '2xl': ['1.953rem', '1.2'], '3xl': ['2.441rem', '1.1'],
      },
    },
  },
  plugins: [],
}