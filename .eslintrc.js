module.exports = {
  root: true,
  ignorePatterns: ["/node_modules"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  env: {
    node: true,
  },
  extends: ["eslint:recommended", "plugin:import/recommended", "prettier"],
  rules: {
    "import/order": [
      "error",
      {
        groups: [
          ["builtin", "external"],
          "internal",
          ["parent", "index", "sibling", "object"],
        ],
        pathGroups: [
          {
            pattern: "*.scss",
            patternOptions: { matchBase: true },
            group: "unknown",
            position: "after",
          },
        ],
        "newlines-between": "always",
        alphabetize: {
          order: "asc",
        },
      },
    ],
    "import/named": 0,
    "import/no-unresolved": 0,
    "no-undef": 0,
    "no-unused-vars": 0,
    "no-var": 2,
    "compat/compat": 0,
  },
};
