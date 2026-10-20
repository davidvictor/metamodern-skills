#!/usr/bin/env node
// The package's command line. One command per job; MM-03 adds `comments`.
//
//   node scripts/canvas.mjs view [--project <dir>] [--port <n>]
//
// `view` starts the viewer for the project that holds canvas.config.json (the --project folder, or the
// nearest one at or above the working directory) on 127.0.0.1, at the config's port unless --port is given.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from './canvas-format.mjs';
import { findProject, startViewer } from './lib/viewer-server.mjs';

const USAGE = 'Usage: canvas view [--project <dir>] [--port <n>]';

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === '--project' || flag === '--port') {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
      options[flag.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`Unknown option ${flag}`);
    }
  }
  if (options.port !== undefined) {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be an integer from 0 to 65535');
    options.port = port;
  }
  return options;
}

async function main(argv) {
  let options;
  try { options = parseArgs(argv); } catch (error) { console.error(`${error.message}\n${USAGE}`); return 1; }
  if (options.command !== 'view') { console.error(USAGE); return 1; }
  const projectRoot = options.project ? path.resolve(options.project) : findProject();
  if (!projectRoot) { console.error('No canvas.config.json in this folder or above it. Pass --project <dir>.'); return 1; }
  let config;
  try { config = await readConfig(projectRoot); } catch (error) { console.error(`canvas.config.json: ${error.message}`); return 1; }
  try {
    const viewer = await startViewer({ projectRoot, config, port: options.port, quiet: false });
    const stop = () => viewer.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? `Port ${options.port ?? config.port} is in use. Pass --port <n>.` : error.message);
    return 1;
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await main(process.argv.slice(2));
  if (code !== null) process.exit(code);
}
