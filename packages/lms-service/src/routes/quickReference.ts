import express from 'express';
import { z } from 'zod';
import QuickReferenceService from '../services/quickReferenceService';
import { logger, auditLog } from '../utils/logger';
import { ApiResponse, QuickReferenceCardSchema } from '../types';

const router = express.Router();
const quickRefService = new QuickReferenceService();

// Validation schemas
const SearchQuerySchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters'),
  category: z.string().optional()
});

const CategoryParamSchema = z.object({
  category: z.enum(['escalation', 'troubleshooting', 'features', 'compliance'])
});

const UpdateCardSchema = QuickReferenceCardSchema.partial().omit({ 'id': true, 'lastUpdated': true });

/**
 * GET /cards
 * Get all quick reference cards with optional category filtering
 */
router.get('/cards', async (req, res) => {
  try {
    const { category } = req.query;

    const cards = await quickRefService.getAllCards(category as string);

    // Remove internal details for public response
    const publicCards = cards.map(card => ({
      id: card.id,
      title: card.title,
      category: card.category,
      summary: card.content.summary,
      printable: card.printable,
      lastUpdated: card.lastUpdated,
      version: card.version
    }));

    logger.info('Quick reference cards retrieved', {
      count: publicCards.length,
      category: category || 'all',
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        cards: publicCards,
        total: publicCards.length,
        categories: await quickRefService.getCategories()
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving quick reference cards:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve quick reference cards',
        code: 'CARDS_RETRIEVAL_ERROR',
        details: error
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /cards/:id
 * Get detailed information about a specific quick reference card
 */
router.get('/cards/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const card = await quickRefService.getCard(id);

    if (!card) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Quick reference card not found',
          code: 'CARD_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    auditLog.userAccess((req as any).user?.id || 'anonymous', 'QUICK_REF_ACCESS', `/quick-reference/${id}`, true);

    logger.info('Quick reference card accessed', {
      cardId: id,
      title: card.title,
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: card
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving quick reference card:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve quick reference card',
        code: 'CARD_RETRIEVAL_ERROR',
        details: error
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /cards/:id/printable
 * Get printable version of a quick reference card
 */
router.get('/cards/:id/printable', async (req, res) => {
  try {
    const { id } = req.params;

    const printableContent = await quickRefService.getPrintableCard(id);

    if (!printableContent) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Printable version not available for this card',
          code: 'PRINTABLE_NOT_AVAILABLE'
        }
      };
      return res.status(404).json(response);
    }

    auditLog.userAccess((req as any).user?.id || 'anonymous', 'QUICK_REF_PRINT', `/quick-reference/${id}/printable`, true);

    logger.info('Printable quick reference accessed', {
      cardId: id,
      userId: (req as any).user?.id
    });

    // Return as plain text for easy printing
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="quick-ref-${id}.txt"`);
    res.send(printableContent);
  } catch (error) {
    logger.error('Error generating printable card:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to generate printable version',
        code: 'PRINTABLE_GENERATION_ERROR',
        details: error
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /categories
 * Get all available quick reference categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await quickRefService.getCategories();

    logger.info('Quick reference categories retrieved', {
      categories,
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        categories,
        descriptions: {
          escalation: 'Priority levels, response times, and escalation procedures',
          troubleshooting: 'Common issues and quick fix procedures',
          features: 'System features, shortcuts, and usage tips',
          compliance: 'HIPAA compliance, security protocols, and regulations'
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving categories:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve categories',
        code: 'CATEGORIES_RETRIEVAL_ERROR',
        details: error
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /categories/:category/cards
 * Get all cards in a specific category
 */
router.get('/categories/:category/cards', async (req, res) => {
  try {
    const categoryValidation = CategoryParamSchema.parse(req.params);
    const { category } = categoryValidation;

    const cards = await quickRefService.getCardsByCategory(category);

    // Remove internal details for public response
    const publicCards = cards.map(card => ({
      id: card.id,
      title: card.title,
      category: card.category,
      summary: card.content.summary,
      printable: card.printable,
      lastUpdated: card.lastUpdated,
      version: card.version
    }));

    logger.info('Category cards retrieved', {
      category,
      count: publicCards.length,
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        category,
        cards: publicCards,
        total: publicCards.length
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving category cards:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve category cards',
        code: 'CATEGORY_CARDS_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /search
 * Search quick reference cards
 */
router.get('/search', async (req, res) => {
  try {
    const validatedQuery = SearchQuerySchema.parse(req.query);
    const { q: query, category } = validatedQuery;

    let results = await quickRefService.searchCards(query);

    // Filter by category if specified
    if (category) {
      results = results.filter(card => card.category === category);
    }

    // Remove internal details for public response
    const publicResults = results.map(card => ({
      id: card.id,
      title: card.title,
      category: card.category,
      summary: card.content.summary,
      relevanceScore: this.calculateRelevanceScore(card, query),
      matchedContent: this.getMatchedContent(card, query)
    }));

    // Sort by relevance
    publicResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    logger.info('Quick reference search performed', {
      query,
      category: category || 'all',
      resultCount: publicResults.length,
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        query,
        category: category || 'all',
        results: publicResults,
        total: publicResults.length
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error searching quick reference cards:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to search quick reference cards',
        code: 'SEARCH_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * POST /cards
 * Create a new quick reference card (admin only)
 */
router.post('/cards', async (req, res) => {
  try {
    const requestingUser = (req as any).user;

    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required to create quick reference cards',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    const validatedCard = QuickReferenceCardSchema.omit({ lastUpdated: true }).parse(req.body);

    const newCard = await quickRefService.createCard(validatedCard);

    auditLog.userAccess(requestingUser.id, 'QUICK_REF_CREATE', `/quick-reference/${newCard.id}`, true, {
      cardTitle: newCard.title,
      category: newCard.category
    });

    logger.info('Quick reference card created', {
      cardId: newCard.id,
      title: newCard.title,
      category: newCard.category,
      createdBy: requestingUser.id
    });

    const response: ApiResponse = {
      success: true,
      data: newCard
    };

    res.status(201).json(response);
  } catch (error) {
    logger.error('Error creating quick reference card:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to create quick reference card',
        code: 'CARD_CREATION_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * PUT /cards/:id
 * Update a quick reference card (admin only)
 */
router.put('/cards/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUser = (req as any).user;

    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required to update quick reference cards',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    const validatedUpdates = UpdateCardSchema.parse(req.body);

    const updatedCard = await quickRefService.updateCard(id, validatedUpdates);

    if (!updatedCard) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Quick reference card not found',
          code: 'CARD_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    auditLog.userAccess(requestingUser.id, 'QUICK_REF_UPDATE', `/quick-reference/${id}`, true, {
      cardTitle: updatedCard.title,
      changes: Object.keys(validatedUpdates)
    });

    logger.info('Quick reference card updated', {
      cardId: id,
      title: updatedCard.title,
      updatedBy: requestingUser.id,
      changes: Object.keys(validatedUpdates)
    });

    const response: ApiResponse = {
      success: true,
      data: updatedCard
    };

    res.json(response);
  } catch (error) {
    logger.error('Error updating quick reference card:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to update quick reference card',
        code: 'CARD_UPDATE_ERROR',
        details: error.message
      }
    };

    res.status(400).json(response);
  }
});

/**
 * GET /analytics
 * Get quick reference analytics (admin only)
 */
router.get('/analytics', async (req, res) => {
  try {
    const requestingUser = (req as any).user;

    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required for quick reference analytics',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    const analytics = await quickRefService.getCardAnalytics();

    logger.info('Quick reference analytics retrieved', {
      adminId: requestingUser.id
    });

    const response: ApiResponse = {
      success: true,
      data: analytics
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving quick reference analytics:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve quick reference analytics',
        code: 'ANALYTICS_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

// Helper functions for search relevance
function calculateRelevanceScore(card: any, query: string): number {
  const searchTerm = query.toLowerCase();
  let score = 0;

  // Title match (highest weight)
  if (card.title.toLowerCase().includes(searchTerm)) {
    score += 10;
  }

  // Summary match (medium weight)
  if (card.content.summary.toLowerCase().includes(searchTerm)) {
    score += 5;
  }

  // Steps match (lower weight)
  if (card.content.steps?.some((step: string) => step.toLowerCase().includes(searchTerm))) {
    score += 3;
  }

  // Tips match (lower weight)
  if (card.content.tips?.some((tip: string) => tip.toLowerCase().includes(searchTerm))) {
    score += 2;
  }

  return score;
}

function getMatchedContent(card: any, query: string): string[] {
  const searchTerm = query.toLowerCase();
  const matches: string[] = [];

  if (card.title.toLowerCase().includes(searchTerm)) {
    matches.push(`Title: ${card.title}`);
  }

  if (card.content.summary.toLowerCase().includes(searchTerm)) {
    matches.push(`Summary: ${card.content.summary.substring(0, 100)}...`);
  }

  card.content.steps?.forEach((step: string, index: number) => {
    if (step.toLowerCase().includes(searchTerm)) {
      matches.push(`Step ${index + 1}: ${step.substring(0, 100)}...`);
    }
  });

  return matches.slice(0, 3); // Limit to top 3 matches
}

export default router;