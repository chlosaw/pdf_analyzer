import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  // Follows the system setting, like the colour variables in index.css
  darkMode: 'media',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Apple's system typefaces first (SF Pro, New York, SF Mono), sensible fallbacks elsewhere.
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Helvetica Neue"', 'system-ui', 'sans-serif'],
        serif: ['ui-serif', '"New York"', '"Iowan Old Style"', 'Palatino', 'Georgia', 'serif'],
        rounded: ['ui-rounded', '"SF Pro Rounded"', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace']
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        highlight: 'hsl(var(--highlight))'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        flash: { '0%': { boxShadow: '0 0 0 4px hsl(var(--highlight))' }, '100%': { boxShadow: '0 0 0 0 transparent' } }
      },
      animation: { flash: 'flash 1.2s ease-out' }
    }
  },
  plugins: [animate]
};
