import nextPlugin from "@next/eslint-plugin-next";

// Flat config that loads cleanly on ESLint 9. The previous setup went through
// FlatCompat → eslint-config-next, which pulls in @rushstack/eslint-patch; that
// patch fails on ESLint 9 ("Failed to patch ESLint because the calling module
// was not recognized") and made `eslint .` / `next build` lint crash outright.
// Using the Next plugin's own flat config avoids the patch entirely. Type-aware
// linting (the old `next/typescript`) is already covered by `npm run typecheck`.
const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"],
  },
  nextPlugin.flatConfig.coreWebVitals,
];

export default eslintConfig;
