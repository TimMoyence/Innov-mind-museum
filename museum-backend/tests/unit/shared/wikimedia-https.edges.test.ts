import { wikimediaHttps } from '@shared/media/wikimedia-https';

const secure = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Joconde.jpg';
const cleartext = secure.replace('https:', 'http:');

describe('wikimediaHttps · bornes', () => {
  it('passe un hôte Wikimedia en https sans toucher au chemin encodé', () => {
    const encoded = `${cleartext}?width=330&name=Mar%C3%ADa`;
    expect(wikimediaHttps(encoded)).toBe(`${secure}?width=330&name=Mar%C3%ADa`);
  });

  it('laisse une URL déjà en https telle quelle', () => {
    expect(wikimediaHttps(secure)).toBe(secure);
  });

  it('laisse un hôte qui n’est pas Wikimedia, même en http', () => {
    const other = cleartext.replace('upload.wikimedia.org', 'example.org');
    expect(wikimediaHttps(other)).toBe(other);
  });

  it('ne se laisse pas tromper par un hôte qui finit comme Wikimedia', () => {
    const lookalike = cleartext.replace('upload.wikimedia.org', 'evilwikimedia.org');
    expect(wikimediaHttps(lookalike)).toBe(lookalike);
  });

  it('rend une URL malformée, null et undefined sans lever', () => {
    const malformed = `${cleartext.slice(0, 7)} pas une url`;
    const absent: string | undefined = [secure].find((u) => u === 'absent');
    expect(wikimediaHttps(malformed)).toBe(malformed);
    expect(wikimediaHttps(null)).toBeNull();
    expect(wikimediaHttps(absent)).toBeUndefined();
  });
});
