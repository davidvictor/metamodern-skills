import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import { workspaceBoundary } from './scripts/workspace-boundary.mjs'
import { libraryBoundary } from './scripts/library-boundary.mjs'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Generated shadcn components and shell modules co-locate small helpers with components.
    files: ['src/components/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // The kit and the workspace layer co-locate small helpers with components.
    files: ['src/kit/**/*.{ts,tsx}', 'src/studio/workspace/**/*.{ts,tsx}', 'example/workspace/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Workspace modules import only @studio/kit, @studio/workspace, React and their own files (references/workspace.md).
    files: ['src/workspace/**/*.{ts,tsx,js,jsx,mjs}', 'example/workspace/**/*.{ts,tsx}'],
    ignores: ['example/workspace/adapter.ts'],
    plugins: { studio: workspaceBoundary },
    rules: { 'studio/imports': 'error' },
  },
  {
    // Plain JavaScript workspace files may use JSX too.
    files: ['src/workspace/**/*.{js,jsx,mjs}'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    // The library layer co-locates small helpers with components.
    files: ['src/studio/library/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Component documentation is data: it imports only @studio/library and its own files (references/library.md).
    files: ['src/library/**/*.{ts,tsx,js,jsx,mjs}', 'example/library/**/*.ts'],
    ignores: ['example/library/adapter.ts', 'example/library/declaration.ts', 'example/library/frame.ts'],
    plugins: { library: libraryBoundary },
    rules: { 'library/imports': 'error' },
  },
])
