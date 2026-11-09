export interface FakeLangfuse {
  fakeClient: { trace: jest.Mock };
  clientTrace: jest.Mock;
  traceGeneration: jest.Mock;
  generationEnd: jest.Mock;
  traceEvent: jest.Mock;
}

export function makeFakeLangfuseClient(): FakeLangfuse {
  const generationEnd = jest.fn();
  const fakeGeneration = { end: generationEnd };
  const traceGeneration = jest.fn().mockReturnValue(fakeGeneration);
  const traceEvent = jest.fn();
  const fakeTrace = { generation: traceGeneration, event: traceEvent };
  const clientTrace = jest.fn().mockReturnValue(fakeTrace);
  const fakeClient = { trace: clientTrace };
  return {
    fakeClient,
    clientTrace,
    traceGeneration,
    generationEnd,
    traceEvent,
  };
}
