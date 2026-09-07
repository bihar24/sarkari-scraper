import globals from "globals";

export default [
  {
    ignores: ["node_modules/", "coverage/", ".cache/", ".sarkari/"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-redeclare": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  {
    files: ["web/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
];
