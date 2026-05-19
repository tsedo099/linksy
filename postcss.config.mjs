/**
 * PostCSS pipeline for Next.js. Tailwind v4 ships its PostCSS plugin so we
 * don't need autoprefixer separately — Tailwind handles vendor prefixing
 * + nesting + custom-property substitution in its single pass.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
