export function acceptedResponse(): Response {
  return {
    ok: true,
    status: 202,
    statusText: 'Accepted',
    json: () => Promise.resolve({ accepted: true }),
  } as Response;
}

export function serverErrorResponse(): Response {
  return {
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: () => Promise.resolve({ message: 'Internal Server Error' }),
  } as Response;
}
