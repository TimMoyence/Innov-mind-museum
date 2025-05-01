import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { Request, Response, Router } from 'express';
import { conversationRepositoryPg } from '../../secondary/conversation.repository.pg';
import {
  getAllConversationsByUserIdUseCase,
  getAllConversationsUseCase,
  getConversationByIdUseCase,
} from '../../../core/useCase/conversation.useCases';
import { validate as isUuid } from 'uuid';

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
    const safeConversationId = isUuid(conversationId) ? conversationId : '';

    const conversation = await getConversationById.execute(safeConversationId);

    if (!conversation || conversation.user.id !== id) {
      res.status(404).json({ error: 'Conversation not found or unauthorized' });
      return;
    }

    res.json(conversation);
  },
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

// Todo : Création d'une route post pour les échange sur un tableau ou une oeuvre

export default ConversationRouter;
