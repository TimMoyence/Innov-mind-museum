import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { Request, Response, Router } from 'express';
import { validate as isUuid } from 'uuid';
import {
  getAllConversationsByUserIdUseCase,
  getAllConversationsUseCase,
  getConversationByIdUseCase,
  PostNewMessageInConversation,
} from '../../../core/useCase/index';
import { IAService } from '../../secondary/conversation.IA';
import { conversationRepositoryPg } from '../../secondary/conversation.repository.pg';

const ConversationRouter: Router = Router();
const getConversationById = getConversationByIdUseCase(
  conversationRepositoryPg,
);
const getAllConversations = getAllConversationsUseCase(
  conversationRepositoryPg,
);
const getAllConversationsByUserId = getAllConversationsByUserIdUseCase(
  conversationRepositoryPg,
);

const iaServiceInstance = new IAService();

const postNewMessageInConversation = new PostNewMessageInConversation(
  conversationRepositoryPg,
  iaServiceInstance,
);

ConversationRouter.get(
  '/all',
  isAuthenticated,
  /**
   * @swagger
   * /api/v1/conversation/all:
   *   get:
   *     summary: Récupère toutes les conversations IA
   *     tags: [Conversation]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Liste des conversations IA
   *       401:
   *         description: Non autorisé
   *       404:
   *         description: Aucune conversation trouvée
   */
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const conversations = await getAllConversations.execute();

    if (!conversations || conversations.length === 0) {
      res.status(404).json({ error: 'No conversations found' });
      return;
    }

    res.json(conversations);
  },
);

ConversationRouter.get(
  '/:conversationId',
  isAuthenticated,
  /**
   * @swagger
   * /api/v1/conversation/{conversationId}:
   *   get:
   *     summary: Récupère une conversation IA par son ID
   *     tags: [Conversation]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: conversationId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de la conversation
   *     responses:
   *       200:
   *         description: Conversation IA complète
   *       401:
   *         description: Non autorisé
   *       404:
   *         description: Conversation introuvable ou accès interdit
   */
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.user as { id: number };
    const { conversationId } = req.params;

    if (!isUuid(conversationId)) {
      res.status(400).json({ error: 'Invalid conversation ID format' });
      return;
    }

    const conversation = await getConversationById.execute(conversationId);

    if (!conversation || conversation.user.id !== id) {
      res.status(404).json({ error: 'Conversation not found or unauthorized' });
      return;
    }

    res.json(conversation);
  },
);

ConversationRouter.get(
  '/all/:userId',
  isAuthenticated,
  /**
   * @swagger
   * /api/v1/conversation/all/{userId}:
   *   get:
   *     summary: Récupère toutes les conversations IA de l'utilisateur
   *     tags: [Conversation]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'utilisateur
   *     responses:
   *       200:
   *         description: Liste des conversations IA
   *       401:
   *         description: Non autorisé
   *       404:
   *         description: Aucune conversation trouvée
   */
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.user as { id: string };

    const conversations = await getAllConversationsByUserId.execute(id);

    if (!conversations || conversations.length === 0) {
      res.status(404).json({ error: 'No conversations found' });
      return;
    }

    res.json(conversations);
  },
);

ConversationRouter.post(
  '/:conversationId/message',
  isAuthenticated,
  /**
   * @swagger
   * /api/v1/conversation/{conversationId}/message:
   *   post:
   *     summary: Envoie un message dans une conversation IA avec prise en compte du ton et de la langue
   *     tags: [Conversation]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: conversationId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de la conversation
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               content:
   *                 type: string
   *                 description: Le message à envoyer. Doit être un texte non vide et ne dépassant pas 500 caractères.
   *                 example: "Peux-tu me parler de cette sculpture moderne ?"
   *               role:
   *                 type: string
   *                 enum: [user, assistant]
   *                 description: Le rôle de l'expéditeur du message.
   *                 default: user
   *                 example: "user"
   *               tone:
   *                 type: string
   *                 enum: [débutant, expert, confirmé]
   *                 description: Le ton de la réponse IA.
   *                 default: débutant
   *                 example: "débutant"
   *               language:
   *                 type: string
   *                 description: La langue de la réponse IA (fr, en, etc.).
   *                 default: fr
   *                 example: "fr"
   *     responses:
   *       200:
   *         description: Message envoyé avec succès
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: object
   *                   properties:
   *                     content:
   *                       type: string
   *                       description: Le contenu du message de l'IA
   *                       example: "Cette sculpture a été créée par Auguste Rodin en 1902."
   *                     role:
   *                       type: string
   *                       enum: [user, assistant]
   *                       description: Le rôle de l'expéditeur du message.
   *                       example: "assistant"
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                       description: Date et heure de création du message
   *                       example: "2025-05-10T14:34:22.000Z"
   *       400:
   *         description: Requête invalide
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: "Content is required"
   *       401:
   *         description: Non autorisé
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: "Unauthorized"
   *       404:
   *         description: Conversation introuvable ou non autorisée
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: "Conversation not found or unauthorized"
   */
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.user as { id: number };
    const { conversationId } = req.params;
    const { content, tone, language } = req.body;

    const safeConversationId = isUuid(conversationId) ? conversationId : '';

    const conversation = await getConversationById.execute(safeConversationId);

    if (!conversation || conversation.user.id !== id) {
      res.status(404).json({ error: 'Conversation not found or unauthorized' });
      return;
    }
    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }
    if (content.length > 500) {
      res.status(400).json({ error: 'Content is too long' });
      return;
    }
    const responseOfIA = await postNewMessageInConversation.execute(
      safeConversationId,
      content,
      'user',
      tone ? tone : 'débutant',
      language ? language : 'fr',
    );

    res.json({ message: responseOfIA });
  },
);

export default ConversationRouter;
