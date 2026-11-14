/**
 * The SDK's copy of Engine's OpenAPI file states the Engine commit it was
 * taken from and has the bytes of the Git blob recorded beside it. Layer 1: it
 * reads two files of this repository.
 *
 * The test reads nothing of Engine. That the commit holds that blob is checked
 * where the copy is updated: `git rev-parse <commit>:api/engine-v1.openapi.json`
 * in an Engine checkout prints the blob ID.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { copyPath, sourcePath } from './spec';

function gitBlobID(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

test('the copy names an Engine commit and has the bytes of the recorded blob', () => {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as Record<string, unknown>;
  expect(source['path']).toBe('api/engine-v1.openapi.json');
  expect(source['commit']).toMatch(/^[0-9a-f]{40}$/);
  expect(source['blob']).toBe(gitBlobID(fs.readFileSync(copyPath)));
});
