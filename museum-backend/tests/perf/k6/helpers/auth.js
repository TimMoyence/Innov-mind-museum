import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function registerUser(email, password) {
  const res = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
    email, password, firstname: 'Load', lastname: 'Test',
  }), { headers: { 'Content-Type': 'application/json' } });
  return res;
}

export function loginUser(email, password) {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'login 200': (r) => r.status === 200 });
  if (res.status === 200) {
    return JSON.parse(res.body);
  }
  return null;
}

export function authHeaders(token) {
  return { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
}

export { BASE_URL };
