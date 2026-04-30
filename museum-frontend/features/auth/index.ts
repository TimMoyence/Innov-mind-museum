/**
 * Auth feature public API.
 *
 * Cross-feature consumers (settings, profile, anything outside `features/auth/`)
 * MUST import through this barrel. Reaching directly into `application/`,
 * `infrastructure/`, or `domain/` from another feature is the cross-feature
 * smell flagged by the 2026-04-30 audit and prevents future refactors of
 * the auth internal layout.
 */
export { useAuth, AuthProvider } from './application/AuthContext';
export { authService } from './infrastructure/authApi';
export { authStorage, clearAccessToken } from './infrastructure/authTokenStore';
export { AUTH_ROUTE } from './routes';
export { useProtectedRoute } from './useProtectedRoute';
