// @ts-check
import angular from '@angular-eslint/eslint-plugin';
import angularTemplate from '@angular-eslint/eslint-plugin-template';
import angularTemplateParser from '@angular-eslint/template-parser';
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import angularEslint from 'angular-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

/**
 * The `@angular-eslint/template` accessibility rule set (alt-text,
 * click-events-have-key-events, valid-aria, role-has-required-aria, …), read
 * out of the package rather than hand-copied. A rule added in a future
 * `angular-eslint` release then arrives with the upgrade instead of silently
 * going missing from a stale list. Only the rules are spread — the plugin and
 * parser stay registered once, below, so flat config sees a single
 * `@angular-eslint/template` definition.
 */
const templateAccessibilityRules = angularEslint.configs.templateAccessibility.reduce(
  (rules, config) => ({ ...rules, ...config.rules }),
  {}
);

export default [
  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.angular/**',
      'coverage/**',
      '*.config.js',
      '*.config.mjs',
    ],
  },

  // TypeScript files configuration
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.spec.json', './tsconfig.e2e.json'],
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        // AUBADE's render loop schedules on vsync rather than on a timer; see
        // src/aubade/gl/loop.ts for why that distinction is load-bearing.
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // Test globals (Vitest)
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      '@angular-eslint': angular,
      prettier: prettierPlugin,
    },
    rules: {
      // ESLint recommended rules
      ...eslint.configs.recommended.rules,

      // TypeScript recommended rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'warn',
        {
          accessibility: 'explicit',
          overrides: {
            constructors: 'no-public',
          },
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          prefix: ['I'],
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'array-simple',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],

      // Angular specific rules
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@angular-eslint/no-empty-lifecycle-method': 'warn',
      '@angular-eslint/use-lifecycle-interface': 'error',
      '@angular-eslint/use-pipe-transform-interface': 'error',
      // Off deliberately: the Angular style guide dropped the mandatory
      // `Component` suffix, and this repo follows the newer convention
      // (`Dashboard`, `Navigation`, `Hero`). Renaming 14 classes backwards to
      // satisfy a superseded rule would be blind compliance, not quality.
      '@angular-eslint/component-class-suffix': 'off',
      '@angular-eslint/directive-class-suffix': 'error',
      '@angular-eslint/no-input-rename': 'error',
      '@angular-eslint/no-output-rename': 'error',
      '@angular-eslint/no-output-native': 'error',
      // Enforced, not suggested: every component in the tree is already
      // OnPush, so ARCHITECTURE.md's claim is now backed by the linter.
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',

      // General code quality rules
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'max-len': [
        'warn',
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],
      complexity: ['warn', 10],
      'max-depth': ['warn', 3],
      'max-lines-per-function': [
        'warn',
        {
          max: 100,
          skipBlankLines: true,
          skipComments: true,
        },
      ],

      // Prettier integration
      'prettier/prettier': 'error',
    },
  },

  // Playwright config and specs. These run in Node, not the browser, so they
  // get `process` and `Buffer`; the app code deliberately does not.
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
  },

  // Spec files
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Off deliberately: a top-level `describe` callback is a suite
      // declaration, not a function whose length signals complexity. Capping
      // it would push cohesive test suites into artificial file splits.
      'max-lines-per-function': 'off',
    },
  },

  // HTML template files configuration
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: angularTemplateParser,
    },
    plugins: {
      '@angular-eslint/template': angularTemplate,
    },
    rules: {
      // Accessibility, enforced rather than aspirational. Every rule here is an
      // error: an a11y regression should fail the build the same way a type
      // error does, not accumulate as a warning nobody reads.
      ...templateAccessibilityRules,

      '@angular-eslint/template/no-negated-async': 'error',
      '@angular-eslint/template/use-track-by-function': 'warn',
      // Off deliberately: this rule predates signals. It exists to stop
      // templates re-running expensive work on every change detection pass —
      // but reading a `signal()` / `computed()` / `input()` *is* a call
      // expression, and is both memoized and dependency-tracked. With every
      // component on OnPush, the calls left in these templates are all signal
      // reads, which is the idiom Angular now prescribes.
      '@angular-eslint/template/no-call-expression': 'off',
      '@angular-eslint/template/banana-in-box': 'error',
      '@angular-eslint/template/no-duplicate-attributes': 'error',
      '@angular-eslint/template/conditional-complexity': ['warn', { maxComplexity: 3 }],
      '@angular-eslint/template/cyclomatic-complexity': ['warn', { maxComplexity: 10 }],
      '@angular-eslint/template/eqeqeq': [
        'error',
        {
          allowNullOrUndefined: true,
        },
      ],
    },
  },

  // Prettier config to disable conflicting rules
  prettierConfig,
];
