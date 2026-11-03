import { Server as HttpsServer } from 'node:https';

import Test = require('supertest/lib/test');

import type { Server } from 'node:net';

interface PendingTest {
  url: string;
  _server?: Server;
  loopbackPending?: Server;
}

const PATCHED = Symbol.for('musaium.supertest-loopback');
const prototype = Test.prototype as Test & { [PATCHED]?: true };

if (!prototype[PATCHED]) {
  const serverAddress = prototype.serverAddress;
  const end = prototype.end;

  prototype.serverAddress = function serverAddressOnLoopback(
    this: Test & PendingTest,
    app: Server,
    path: string,
  ): string {
    if (app.address()) return serverAddress.call(this, app, path);
    this.loopbackPending = app;
    const protocol = app instanceof HttpsServer ? 'https' : 'http';
    return `${protocol}://127.0.0.1:0${path}`;
  } as typeof serverAddress;

  prototype.end = function endOnLoopback(this: Test & PendingTest, callback) {
    const app = this.loopbackPending;
    if (!app) return end.call(this, callback);
    this.loopbackPending = undefined;
    app.listen(0, '127.0.0.1', () => {
      const address = app.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      this._server = app;
      this.url = this.url.replace('127.0.0.1:0', `127.0.0.1:${String(port)}`);
      end.call(this, callback);
    });
    return this;
  } as typeof end;

  prototype[PATCHED] = true;
}
