// SSRF_FIXTURE — DO NOT IMPORT — this file exists only so the import-graph
// guard test can prove it detects unsafe fetch patterns. The guard MUST
// flag this file when scanning the fixture directory.

export async function unsafeImageFetch(wikidataImageUrl: string): Promise<Response> {
  return fetch(wikidataImageUrl);
}
