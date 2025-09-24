import { createImageInsightUseCase } from '@IA/imageInsight/core/useCase';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { Request, Response, Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { validate as isUuid } from 'uuid';
import { imageInsightRepositoryPg } from '../../secondary/imageInsight.repository.pg';

const ImageInsightRouter: Router = Router();
const upload = multer();

const createInsight = createImageInsightUseCase(imageInsightRepositoryPg);

ImageInsightRouter.post(
  '/',
  isAuthenticated,
  upload.single('image'),
  /**
   * @swagger
   * /api/v1/image-insight:
   *   post:
   *     summary: Analyse une image comme dans un musée
   *     tags: [Image Insight]
   *     security:
   *       - bearerAuth: []
   *     consumes:
   *       - multipart/form-data
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               image:
   *                 type: string
   *                 format: binary
   *                 description: Image à analyser
   *               conversationId:
   *                 type: string
   *                 description: ID d'une conversation existante (optionnel)
   *     responses:
   *       200:
   *         description: Retourne l’analyse IA et l’ID de la conversation
   *       204:
   *         description: Image non interprétable par l’IA
   *       400:
   *         description: Image manquante
   *       401:
   *         description: Non autorisé
   */
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.user as { id: number };
    const image = req.file;
    console.log(image);
    const conversationId: string = req.body.conversationId;

    if (!image) {
      res.status(400).json({ error: 'Image is required' });
      return;
    }

    const base64 = image.buffer.toString('base64');

    const safeConversationId = isUuid(conversationId)
      ? conversationId
      : randomUUID();

    const conversation = await createInsight.execute(
      base64,
      id,
      safeConversationId,
    );

    if (!conversation) {
      res.status(204).json({ message: 'Image non interprétable' });
      return;
    }

    res.json({
      conversationId: conversation.id,
      messages: conversation.messages,
    });
  },
);

export default ImageInsightRouter;
