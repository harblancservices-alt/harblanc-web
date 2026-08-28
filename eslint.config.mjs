import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // Respect the leading-underscore convention this codebase already uses for
  // a binding that exists ON PURPOSE without being read.
  //
  // The dominant case is stripping props out of a rest spread so they cannot
  // reach the DOM -- `const { variant: _v, ...anchorRest } = props` in
  // components/ui/Button.tsx. `_v` is unused BY DESIGN; deleting it to
  // satisfy the rule would put `variant` back into `anchorRest` and leak a
  // styling-only prop onto a real <a> element. The same idiom appears in
  // QuickActions.tsx for props a component deliberately ignores.
  //
  // So the rule, not the code, was wrong here: its default patterns simply
  // do not know the convention. The alternative was deleting 12 bindings
  // that are load-bearing precisely because they are unused.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
