import { buildRasterMapStyle } from '@musaium/shared/map';

export const dynamic = 'force-static';

export function GET(): Response {
  return Response.json(buildRasterMapStyle(false), {
    headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
  });
}
