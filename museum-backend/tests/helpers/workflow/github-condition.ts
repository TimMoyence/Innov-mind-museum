const unwrap = (expression: string): string => {
  const trimmed = expression.trim();
  return trimmed.startsWith('${{') && trimmed.endsWith('}}')
    ? trimmed.slice(3, -2).trim()
    : trimmed;
};

const quote = (value: string): string => `'${value}'`;

const literal = (token: string): boolean => {
  if (token === 'true') return true;
  if (token === 'false') return false;
  const startsWith = /^startsWith\('([^']*)', '([^']*)'\)$/.exec(token);
  if (startsWith) return startsWith[1].startsWith(startsWith[2]);
  const comparison = /^'([^']*)' (==|!=) '([^']*)'$/.exec(token);
  if (!comparison) throw new Error(`condition non reconnue : ${token}`);
  return (comparison[1] === comparison[3]) === (comparison[2] === '==');
};

const flat = (expression: string): boolean =>
  expression.split('||').some((term) => term.split('&&').every((factor) => literal(factor.trim())));

export const evaluateGithubCondition = (
  expression: string,
  context: { event: string; ref?: string; inputs?: Record<string, string | boolean> },
): boolean => {
  const input = (name: string): string => {
    const value = context.inputs?.[name] ?? '';
    return typeof value === 'boolean' ? String(value) : quote(value);
  };
  let reduced = unwrap(expression)
    .replaceAll('github.event_name', quote(context.event))
    .replaceAll('github.ref', quote(context.ref ?? 'refs/heads/main'))
    .replaceAll('github.event.inputs.', 'inputs.')
    .replace(/inputs\.([a-z_]+)/g, (_, name: string) => input(name))
    .replace(/vars\.[A-Z_]+/g, quote(''));
  for (;;) {
    const group = /(startsWith)?\(([^()]*)\)/.exec(reduced);
    if (!group) return flat(reduced);
    const value = group[1] ? literal(group[0]) : flat(group[2]);
    reduced = reduced.replace(group[0], String(value));
  }
};
