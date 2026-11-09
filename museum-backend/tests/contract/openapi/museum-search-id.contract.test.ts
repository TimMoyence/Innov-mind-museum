import openApiSpec from '../../../openapi/openapi.json';

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
} & Record<string, unknown>;

const getSearchItemSchema = (): JsonSchema => {
  const spec = openApiSpec as unknown as {
    paths: Record<
      string,
      Record<
        string,
        { responses: Record<string, { content: Record<string, { schema: JsonSchema }> }> }
      >
    >;
  };
  const op = spec.paths['/api/museums/search']?.get;
  if (!op) throw new Error('GET /api/museums/search not found in OpenAPI spec');
  const responseSchema = op.responses['200']?.content['application/json']?.schema;
  if (!responseSchema?.properties?.museums?.items) {
    throw new Error('search 200 response: museums[] items schema not found');
  }
  return responseSchema.properties.museums.items;
};

describe('OpenAPI contract — GET /api/museums/search item exposes optional id (R4)', () => {
  it('documents `id` as an integer property of each search result item', () => {
    const item = getSearchItemSchema();
    expect(item.properties).toBeDefined();
    expect(item.properties).toHaveProperty('id');
    expect(item.properties?.id?.type).toBe('integer');
  });

  it('does NOT add `id` to the item `required` list (optional → additive, OSM rows omit it)', () => {
    const item = getSearchItemSchema();
    const required = Array.isArray(item.required) ? item.required : [];
    expect(required).not.toContain('id');
  });
});
