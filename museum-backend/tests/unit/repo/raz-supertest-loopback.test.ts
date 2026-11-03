import express from 'express';
import request from 'supertest';

describe('RAZ-TEST-LOOPBACK', () => {
  it('RAZ-TEST-LOOPBACK · le serveur éphémère de supertest écoute sur 127.0.0.1, l’adresse que vise son client', async () => {
    let localAddress: string | undefined;
    const app = express();
    app.get('/', (req, res) => {
      localAddress = req.socket.localAddress;
      res.sendStatus(204);
    });

    await request(app).get('/').expect(204);

    expect(localAddress).toBe('127.0.0.1');
  });
});
