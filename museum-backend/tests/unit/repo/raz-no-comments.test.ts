import {
  commentsOf,
  isDisable,
  trackedSources,
  type FoundComment,
} from 'tests/helpers/repo/source-comments';

const where = ({ path, line }: FoundComment): string => `${path}:${String(line)}`;

describe('RAZ-M3', () => {
  const comments = trackedSources().flatMap(commentsOf);

  it('RAZ-M3-COMMENTS · aucun fichier de code suivi ne porte de commentaire, hors migrations jouées, code généré et dépendances', () => {
    expect(comments.filter((comment) => !isDisable(comment)).map(where)).toEqual([]);
  });

  it('RAZ-M3-DISABLES · aucun fichier de code suivi ne désactive une règle de lint, de typage ou de mutation', () => {
    expect(comments.filter(isDisable).map(where)).toEqual([]);
  });
});
