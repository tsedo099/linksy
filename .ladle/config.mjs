/**
 * Ladle (component preview tool) configuration. Lighter than Storybook —
 * no manager / sandbox split, just Vite. Stories live next to the
 * components they document as `*.stories.tsx`.
 *
 * Run `npm run stories` to launch the dev server,
 * `npm run stories:build` to produce a static build for hosting on
 * Cloudflare Pages / Netlify.
 */
export default {
  stories: "components/**/*.stories.tsx",
  outDir: "build-stories",
  viteConfig: ".ladle/vite.config.mjs",
  addons: {
    a11y: { enabled: true },
    theme: { enabled: true, defaultState: "dark" },
    rtl: { enabled: true },
  },
  appendToHead: `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
  `,
};
