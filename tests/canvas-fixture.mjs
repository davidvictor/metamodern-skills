// Shared helpers for the canvas package tests (not a test file itself).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const PACKAGE = path.resolve('metamodern-work-on-canvases');

/** A 1 by 1 PNG. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** A fixture project in a temporary folder: the fixture project, the showcase review.json and the kit's tokens. */
export async function fixtureProject(prefix = 'canvas-builder-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.cp(path.join(PACKAGE, 'assets', 'fixture-project'), root, { recursive: true });
  await fs.copyFile(path.join(PACKAGE, 'assets', 'fixture-builder', 'review.json'), path.join(root, 'review.json'));
  await fs.mkdir(path.join(root, 'kit', 'current'), { recursive: true });
  await fs.copyFile(path.join(PACKAGE, 'assets', 'fixture-kit', 'src', 'tokens.json'), path.join(root, 'kit', 'current', 'tokens.json'));
  return root;
}
