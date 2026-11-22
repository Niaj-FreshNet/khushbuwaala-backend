import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

// Flat config. (The old file declared languageOptions twice, so the TypeScript parser was
// dropped and no .ts file could be linted.) Run: npm run lint
export default [
  { ignores: ["dist/**", "node_modules/**", "uploads/**"] },
  {
    files: ["src/**/*.ts", "prisma/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      globals: { require: "readonly", module: "readonly", exports: "readonly", process: "readonly", console: "readonly" },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      // the TypeScript-aware version; the core rule misreads types and enums
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "prefer-const": "error",
      "no-console": "off",
    },
  },
];
