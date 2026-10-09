import { readFileSync } from 'node:fs';
import path from 'node:path';
const aliases = JSON.parse(readFileSync('.studio-generated/selection.json', 'utf8'));
/** Build-time explicit maps, never guessed globs. Static review has no saved-file routes. */
export default {
  ...(process.env.STUDIO_STATIC === '1' ? { output: 'export' } : {}),
  distDir: '.next', devIndicators: false,
  compiler: { define: { __STUDIO_LOCAL_ANNOTATIONS__: process.env.STUDIO_LOCAL_ANNOTATIONS === '1' && process.env.NODE_ENV === 'development' && process.env.STUDIO_STATIC !== '1' } },
  turbopack: { resolveAlias: aliases },
  webpack(config) {
    Object.assign(config.resolve.alias, Object.fromEntries(Object.entries(aliases).map(([id, file]) => [id + '$', path.resolve(file)])));
    return config;
  },
}
