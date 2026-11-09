export async function unsafeImageFetch(wikidataImageUrl: string): Promise<Response> {
  return fetch(wikidataImageUrl);
}

export async function unsafeImageFetchAllCaps(imageURL: string): Promise<Response> {
  return fetch(imageURL);
}
