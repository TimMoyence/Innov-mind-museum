import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Recursively collect all .ts files under the given root directory,
 * skipping node_modules, dist, and __tests__ paths.
 * @param root
 */
export async function collectTsFilesRec(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.'))
        continue;
      out.push(...(await collectTsFilesRec(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(fullPath);
    }
  }
  return out;
}
