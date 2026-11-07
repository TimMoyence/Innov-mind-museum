import { createServer } from 'node:http';

const MONA_LISA = [
  {
    url: 'https://en.wikipedia.org/wiki/Mona_Lisa',
    title: 'Mona Lisa - Wikipedia',
    content:
      'The Mona Lisa is a half-length portrait painting by the Italian artist Leonardo da Vinci. It has been on permanent display at the Louvre in Paris since 1797.',
  },
];

createServer((req, res) => {
  const query = new URL(req.url ?? '/', 'http://stub').searchParams.get('q') ?? '';
  const results = /mona lisa|joconde/i.test(query) ? MONA_LISA : [];
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ results }));
}).listen(8890, '127.0.0.1');
