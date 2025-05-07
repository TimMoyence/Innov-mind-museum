import { museumArtIAUseCase } from '@modules/IA/museum/core/useCase';
import { Request, Response, Router } from 'express';

const museumIARouter: Router = Router();

/**
 * @swagger
 * /api/v1/ia/museum:
 *   post:
 *     summary: Ask the IA a question about a piece of art
 *     tags:
 *       - IA Museum
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [artName, artist, responseTon]
 *             properties:
 *               artName:
 *                 type: string
 *                 description: Name of the art piece
 *               artist:
 *                 type: string
 *                 description: Name of the artist
 *               responseTon:
 *                 type: string
 *                 description: Expected tone of the IA response (e.g., friendly, professional)
 *     responses:
 *       200:
 *         description: Successful IA response
 *       500:
 *         description: Server error
 */
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
