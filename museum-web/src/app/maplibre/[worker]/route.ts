import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-static';
export const dynamicParams = false;

const maplibreDir = (): string => join(process.cwd(), 'node_modules/maplibre-gl');

export function generateStaticParams(): { worker: string }[] {
  const { version } = JSON.parse(readFileSync(join(maplibreDir(), 'package.json'), 'utf8')) as {
    version: string;
  };
  return [{ worker: `maplibre-gl-worker-${version}.mjs` }];
}

export function GET(): Response {
  return new Response(readFileSync(join(maplibreDir(), 'dist/maplibre-gl-worker.mjs')), {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
