/**
 * Auth feature surface — re-exports for callers that want a stable entry point.
 *
 * Deep imports into `application/`, `infrastructure/`, `domain/` are allowed
 * (and currently the dominant pattern across the codebase — see
 * `features/README.md`). Add a re-export here only when a symbol becomes
 * part of a stable cross-feature API and you want to insulate consumers
 * from internal layout changes.
 *
 * History: the previous docblock claimed cross-feature imports "MUST" go
 * through this barrel. Audit 2026-05-12 (P1-6) measured 265 cross-feature
 * deep imports vs 8 barrel imports (~33:1). The doctrine was untruthful
 * per UFR-013 and was retired — barrels are now opt-in, not mandatory.
 */
export { useAuth, AuthProvider } from './application/AuthContext';
export { authService } from './infrastructure/authApi';
export { authStorage, clearAccessToken } from './infrastructure/authTokenStore';
export { AUTH_ROUTE } from './routes';
export { useProtectedRoute } from './useProtectedRoute';
