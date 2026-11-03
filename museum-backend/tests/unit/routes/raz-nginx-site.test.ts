import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE = readFileSync(resolve(__dirname, '../../../deploy/nginx/site.conf.prod'), 'utf8');

describe('RAZ-M10-NGINX', () => {
  it('RAZ-M10-NGINX · aucun server_name ne sert museum.asilidesign.fr, domaine sans DNS qui bloquait le renouvellement du certificat asilidesign.fr', () => {
    expect(SITE).not.toMatch(/museum\.asilidesign\.fr/);
    expect(SITE).toMatch(/server_name asilidesign\.fr www\.asilidesign\.fr\s/);
  });

  it('RAZ-M10-NGINX · la copie du dépôt garde le error_log muet de la prod (jetons des liens jamais écrits en clair)', () => {
    expect(SITE).toContain('error_log /dev/null;');
  });
});
