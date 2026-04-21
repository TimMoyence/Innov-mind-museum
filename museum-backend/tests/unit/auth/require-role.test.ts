import { requireRole } from '@src/helpers/middleware/require-role.middleware';
import {
  makePartialRequest,
  makePartialResponse,
  makeNext,
} from '../../helpers/http/express-mock.helpers';

describe('requireRole middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next() when user has an allowed role', () => {
    const middleware = requireRole('admin', 'moderator');
    const req = makePartialRequest({ user: { id: 1, role: 'admin' } });
    const res = makePartialResponse();
    const next = makeNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user role is not in allowed list', () => {
    const middleware = requireRole('admin');
    const req = makePartialRequest({ user: { id: 1, role: 'visitor' } });
    const res = makePartialResponse();
    const next = makeNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
  });

  it('returns 403 when req.user is missing', () => {
    const middleware = requireRole('admin');
    const req = makePartialRequest();
    const res = makePartialResponse();
    const next = makeNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when req.user has no role', () => {
    const middleware = requireRole('admin');
    const req = makePartialRequest({ user: { id: 1 } });
    const res = makePartialResponse();
    const next = makeNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('supports multiple allowed roles', () => {
    const middleware = requireRole('admin', 'moderator', 'museum_manager');
    const req = makePartialRequest({ user: { id: 1, role: 'museum_manager' } });
    const res = makePartialResponse();
    const next = makeNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('does not leak required roles in error message', () => {
    const middleware = requireRole('admin');
    const req = makePartialRequest({ user: { id: 1, role: 'visitor' } });
    const res = makePartialResponse();
    const next = makeNext();

    middleware(req, res, next);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.message).not.toContain('admin');
    expect(body.error.message).toBe('Insufficient permissions');
  });
});
