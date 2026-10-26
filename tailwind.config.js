/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
      colors: {
        ink: { 950: '#03060b', 900: '#060b13', 850: '#09101b', 800: '#0c1522', 700: '#132033', 600: '#1c2d45', 500: '#2a4062' },
        sev: { critical: '#ff2d55', high: '#ff7a1a', medium: '#ffc21a', low: '#3aa0ff', info: '#7d8ca3' },
        cyan: { glow: '#22e3ff' },
      },
      keyframes: {
        pulsered: { '0%,100%': { boxShadow: '0 0 0 0 rgba(255,45,85,.55)' }, '50%': { boxShadow: '0 0 0 6px rgba(255,45,85,0)' } },
        flash: { '0%': { opacity: '0' }, '15%': { opacity: '1' }, '100%': { opacity: '0' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        slidein: { '0%': { transform: 'translateY(-6px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: { pulsered: 'pulsered 1.6s ease-out infinite', flash: 'flash 1.4s ease-out', marquee: 'marquee var(--marquee-dur,120s) linear infinite', slidein: 'slidein .35s ease-out' },
    },
  },
  plugins: [],
};
