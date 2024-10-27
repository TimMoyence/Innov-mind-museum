import { IAMuseumArt } from '../../adapters/secondary/IAMuseumArt';
import { museumArtIA } from './museumArtIA';

const iaMuseumArt = new IAMuseumArt();

const museumArtIAUseCase = new museumArtIA(iaMuseumArt);

export { museumArtIAUseCase };
