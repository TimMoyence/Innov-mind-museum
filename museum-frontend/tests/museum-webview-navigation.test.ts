import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldAllowNavigation } from '../features/museum/infrastructure/webViewNavigation';

test('shouldAllowNavigation allows about:blank so Leaflet can bootstrap', () => {
  assert.equal(shouldAllowNavigation('about:blank'), 'allow');
  assert.equal(shouldAllowNavigation('about:srcdoc'), 'allow');
});

test('shouldAllowNavigation allows http(s) navigations', () => {
  assert.equal(shouldAllowNavigation('https://tile.openstreetmap.org/1/2/3.png'), 'allow');
  assert.equal(shouldAllowNavigation('http://example.test/foo'), 'allow');
});

test('shouldAllowNavigation flags mailto/tel as external (opened via Linking)', () => {
  assert.equal(shouldAllowNavigation('mailto:hello@musaium.app'), 'external');
  assert.equal(shouldAllowNavigation('tel:+33123456789'), 'external');
});

test('shouldAllowNavigation denies everything else', () => {
  assert.equal(shouldAllowNavigation('javascript:alert(1)'), 'deny');
  assert.equal(shouldAllowNavigation('file:///etc/passwd'), 'deny');
  assert.equal(shouldAllowNavigation('data:text/html,<h1>x</h1>'), 'deny');
  assert.equal(shouldAllowNavigation('ftp://example.test'), 'deny');
  assert.equal(shouldAllowNavigation(''), 'deny');
});
