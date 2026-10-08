import { designUiBoundary } from './scripts/design-ui-boundary.mjs'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import { workspaceBoundary } from './scripts/workspace-boundary.mjs'
import { libraryBoundary } from './scripts/library-boundary.mjs'

export default defineConfig([
  { files: ['src/design-ui/**/*.{ts,tsx,js,jsx,mjs}', 'example/design-ui/**/*.{ts,tsx}'], plugins: { 'design-ui': designUiBoundary }, rules: { 'design-ui/imports': 'error', 'react-refresh/only-export-components': 'off' } },
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
    files: ['src/kit/**/*.{ts,tsx}', 'src/studio/workspace/**/*.{ts,tsx}', 'src/studio/design-ui/**/*.{ts,tsx}', 'src/design-ui/**/*.{ts,tsx}', 'example/design-ui/**/*.{ts,tsx}', 'example/workspace/**/*.{ts,tsx}'],
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
    // Plain JavaScript documentation files parse JSX only so library/files can name the file instead of a parse error.
    files: ['src/library/**/*.{js,jsx,mjs}'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    // Component documentation is data: it imports only @studio/library and its own files (references/library.md).
    files: ['src/library/**/*.{ts,tsx,js,jsx,mjs}', 'example/library/**/*.ts'],
    ignores: ['example/library/adapter.ts', 'example/library/declaration.ts', 'example/library/frame.ts', 'example/library/sections.ts', 'example/library/invalid.ts'],
    plugins: { library: libraryBoundary },
    // Documentation is data: .ts, .js or .mjs only, so no JSX reaches it (library/files refuses .tsx and .jsx).
    rules: { 'library/imports': 'error', 'library/files': 'error' },
  },
])
