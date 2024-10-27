import { museumArtIAUseCase } from '@modules/IA/museum/core/useCase';
import { Request, Response, Router } from 'express';

const museumIARouter: Router = Router();

const handler = async (req: Request, res: Response) => {
  const { artName, artist, responseTon } = req.body;

  try {
    const response = await museumArtIAUseCase.askQuestionOnArtToIA(
      artName,
      artist,
      responseTon,
    );
    return res.status(200).send(response);
  } catch (error) {
    return res.status(500).send({ error: 'An error occurred' });
  }
};

museumIARouter.post('/', (req: Request, res: Response) => {
  handler(req, res);
});

export default museumIARouter;
