import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores: [".next/**", "node_modules/**", "src/db/migrations/**"] },
  ...nextCoreWebVitals,
  {
    rules: {
      "@next/next/no-img-element": "warn",
    },
  },
];

export default config;
