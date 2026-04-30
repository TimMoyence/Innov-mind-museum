/**
 * SSRF_FIXTURE — DO NOT IMPORT
 *
 * Synthetic SSRF violator used by the import-graph guard self-test in
 * `ssrf-matrix.integration.test.ts`. Must contain a literal `fetch(<imageUrl>)`
 * pattern WITHOUT a sibling guard-import reference (is-Safe-Image-Url /
 * assert-Safe-Image-Url — split to avoid false-positive regex match here),
 * otherwise the guard scan would not detect it and the self-test goes vacuous.
 * @remarks keep — this file's body is intentionally unsafe; do not refactor.
 * Justification: guard self-test reads this file's text via fs.readFile,
 * so these exports do not need an importer. Stripping these symbols would
 * make the self-test vacuous.
 * Approved-by: phase0-spec-§6.1
 */

export async function unsafeImageFetch(wikidataImageUrl: string): Promise<Response> {
  return fetch(wikidataImageUrl);
}

export async function unsafeImageFetchAllCaps(imageURL: string): Promise<Response> {
  return fetch(imageURL);
}
