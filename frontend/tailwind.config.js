/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Soft-blob look (see the design canvas). Token NAMES are unchanged so no component logic changed:
      // "teal" is now the navy primary, "saffron" the highlighter yellow.
      colors: {
        ink: { DEFAULT: '#1D2433', soft: '#5B6272', faint: '#737A8A' },
        paper: { DEFAULT: '#FFFFFF', deep: '#F4F5F7' },
        teal: { DEFAULT: '#1D2433', dark: '#0E1320', light: '#E3F2F5' },
        saffron: { DEFAULT: '#FFD84D', dark: '#7A5600', light: '#FFF4CC' },
        coral: { DEFAULT: '#F28B82', light: '#FDE6E3' },
        mist: { DEFAULT: '#B5DCE3', light: '#E3F2F5' },
        sage: { DEFAULT: '#9DB59A', light: '#E6EEE4' },
        line: '#E8EAEE',
        danger: { DEFAULT: '#C2362B', light: '#FBE4E1' },
        safe: { DEFAULT: '#2E6B45', light: '#E6EEE4' },
        unsure: { DEFAULT: '#4B5BA8', light: '#E3F2F5' },
      },
      fontFamily: {
        sans: ['Poppins', '"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
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
