import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, createSign } from 'node:crypto';

const KID = 'phase5-spoof-kid';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export interface SocialJwtSpoof {
  jwksUrl: string;
  signToken: (claims: Record<string, unknown>) => string;
  stop: () => Promise<void>;
}

export async function startSocialJwtSpoof(): Promise<SocialJwtSpoof> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const jwk = publicKey.export({ format: 'jwk' });
  const jwks = {
    keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: KID, use: 'sig', alg: 'RS256' }],
  };

  const server: Server = createServer((req, res) => {
    if (req.url === '/keys' || req.url === '/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(jwks));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const jwksUrl = `http://127.0.0.1:${port}/keys`;

  function signToken(claims: Record<string, unknown>): string {
    const header = { alg: 'RS256', typ: 'JWT', kid: KID };
    const headerSeg = base64url(Buffer.from(JSON.stringify(header)));
    const payloadSeg = base64url(Buffer.from(JSON.stringify(claims)));
    const signingInput = `${headerSeg}.${payloadSeg}`;

    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(privateKey);
    return `${signingInput}.${base64url(signature)}`;
  }

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await new Promise<void>((r) =>
      server.close(() => {
        r();
      }),
    );
  };

  return { jwksUrl, signToken, stop };
}
