// SYNTHETIC FIXTURE — proves the rule fires when fed a deliberate violation.
// Used by Task D6 verification step. Not part of the baselined files.
type User = { id: number; email: string; passwordHash: string };
const u = { id: 1, email: 'x@y.z', passwordHash: 'h' } as User;
export { u };
