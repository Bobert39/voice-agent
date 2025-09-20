import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import { QuickReferenceCard } from '../types';

class QuickReferenceService {
  private quickRefPath: string;
  private cards: Map<string, QuickReferenceCard> = new Map();

  constructor() {
    this.quickRefPath = path.join(__dirname, '../data/quick-reference');
    this.loadQuickReferenceCards();
  }

  private async loadQuickReferenceCards() {
    try {
      // Initialize quick reference cards from markdown files
      const cards: QuickReferenceCard[] = [
        {
          id: 'escalation-priority-guide',
          title: 'Escalation Priority Guide',
          category: 'escalation',
          content: {
            summary: 'Priority levels, response times, and action steps for different escalation types',
            steps: [
              '🔴 CRITICAL (<2 min): Medical emergency, severe distress',
              '🟡 HIGH (<5 min): Verification failures, angry patients',
              '🔵 MEDIUM (<15 min): Complex requests, confusion',
              '⚪ LOW (<30 min): General questions, feedback'
            ],
            warnings: [
              'Never delay CRITICAL escalations',
              'Document reason if SLA missed',
              'Follow HIPAA rules - verify identity first'
            ],
            tips: [
              'Set dashboard to filter by priority',
              'Use notification sounds for CRITICAL',
              'When in doubt, escalate to supervisor'
            ]
          },
          printable: true,
          lastUpdated: new Date('2025-01-15'),
          version: '1.2'
        },

        {
          id: 'troubleshooting-ai-issues',
          title: 'AI System Troubleshooting',
          category: 'troubleshooting',
          content: {
            summary: 'Common AI system issues and their quick fixes',
            steps: [
              '1. Check AI confidence score (should be >60%)',
              '2. Listen for background noise or poor connection',
              '3. Assess patient communication clarity',
              '4. Review conversation history for patterns',
              '5. Take manual control if confidence <40%'
            ],
            warnings: [
              'Don\'t let AI struggle beyond 3 failed attempts',
              'Take over immediately if patient gets frustrated',
              'Document all technical issues for AI team'
            ],
            tips: [
              'Coach patients to speak clearly',
              'Ask patients to reduce background noise',
              'Use alternative verification methods',
              'Monitor confidence scores continuously'
            ]
          },
          printable: true,
          lastUpdated: new Date('2025-01-15'),
          version: '1.1'
        },

        {
          id: 'hipaa-compliance-quick-check',
          title: 'HIPAA Compliance Quick Check',
          category: 'compliance',
          content: {
            summary: 'Essential HIPAA compliance checkpoints for every patient interaction',
            steps: [
              '1. Verify patient identity before sharing ANY information',
              '2. Use minimum necessary information principle',
              '3. Never disclose PHI to unauthorized persons',
              '4. Document all disclosures and authorizations',
              '5. Report any potential violations immediately'
            ],
            warnings: [
              'NEVER share PHI without proper verification',
              'Family members need authorization on file',
              'Emergency situations have special rules',
              'All violations must be reported within 24 hours'
            ],
            tips: [
              'When in doubt, don\'t disclose',
              'Use "I need to verify your identity first" script',
              'Keep authorization forms updated',
              'Document reasoning for all disclosures'
            ]
          },
          printable: true,
          lastUpdated: new Date('2025-01-15'),
          version: '1.3'
        },

        {
          id: 'dashboard-navigation-quick-guide',
          title: 'Dashboard Navigation Quick Guide',
          category: 'features',
          content: {
            summary: 'Essential dashboard features and keyboard shortcuts',
            steps: [
              'F1: Take over current call',
              'F2: Accept escalation',
              'F3: Transfer to voicemail',
              'F4: Conference with supervisor',
              'F5: Refresh dashboard',
              'Ctrl+N: Add patient note'
            ],
            warnings: [
              'Always confirm before transferring calls',
              'Check patient consent before conferencing',
              'Don\'t leave calls unattended during transfer'
            ],
            tips: [
              'Use filters to manage call queue',
              'Set up custom priority notifications',
              'Keep patient info window open',
              'Use quick notes for common responses'
            ]
          },
          printable: true,
          lastUpdated: new Date('2025-01-15'),
          version: '1.0'
        },

        {
          id: 'patient-communication-scripts',
          title: 'Patient Communication Scripts',
          category: 'features',
          content: {
            summary: 'Professional scripts for common patient interactions',
            steps: [
              'Greeting: "Hello, this is [Name] from Capitol Eye Care. I\'m here to help you."',
              'Taking over from AI: "I\'m a staff member taking over to better assist you."',
              'Verification: "For your privacy and security, I need to verify your identity."',
              'Apology: "I apologize for any confusion. Let me help you directly."',
              'Closure: "Is there anything else I can help you with today?"'
            ],
            warnings: [
              'Always maintain professional tone',
              'Never admit AI system failures to patients',
              'Don\'t promise what you can\'t deliver'
            ],
            tips: [
              'Speak slowly and clearly',
              'Use empathetic language',
              'Confirm understanding before proceeding',
              'End on a positive note'
            ]
          },
          printable: true,
          lastUpdated: new Date('2025-01-15'),
          version: '1.0'
        },

        {
          id: 'emergency-procedures',
          title: 'Emergency Procedures',
          category: 'escalation',
          content: {
            summary: 'Critical emergency response procedures',
            steps: [
              '1. Identify emergency type (medical, security, system)',
              '2. For medical: "Call 911 immediately, I\'ll stay on the line"',
              '3. For security: Do not share information, escalate to IT',
              '4. For system: Switch to backup procedures',
              '5. Document everything immediately',
              '6. Notify supervisor as soon as safe'
            ],
            warnings: [
              'Patient safety always comes first',
              'Never hang up during medical emergencies',
              'Don\'t investigate security issues yourself',
              'Follow exact emergency protocols'
            ],
            tips: [
              'Stay calm and speak clearly',
              'Get patient location if possible',
              'Keep emergency contact list handy',
              'Practice scenarios regularly'
            ]
          },
          printable: true,
          lastUpdated: new Date('2025-01-15'),
          version: '1.0'
        },

        {
          id: 'appointment-scheduling-tips',
          title: 'Appointment Scheduling Tips',
          category: 'features',
          content: {
            summary: 'Best practices for efficient appointment scheduling',
            steps: [
              '1. Confirm patient identity and contact information',
              '2. Ask about appointment reason and urgency',
              '3. Check provider availability and preferences',
              '4. Offer 2-3 specific time options',
              '5. Confirm appointment details and send reminder',
              '6. Document any special needs or accommodations'
            ],
            warnings: [
              'Don\'t schedule without verifying insurance',
              'Check for appointment conflicts',
              'Verify patient contact information',
              'Note any accessibility requirements'
            ],
            tips: [
              'Use appointment templates for efficiency',
              'Block time for complex procedures',
              'Keep cancellation policy handy',
              'Confirm day before appointment'
            ]
          },
          printable: true,
          lastUpdated: new Date('2025-01-15'),
          version: '1.0'
        },

        {
          id: 'system-alerts-response',
          title: 'System Alerts Response Guide',
          category: 'troubleshooting',
          content: {
            summary: 'How to respond to different system alerts and notifications',
            steps: [
              '1. Red alerts: Stop current task, address immediately',
              '2. Yellow alerts: Complete current call, then address',
              '3. Blue alerts: Address during next break',
              '4. System maintenance: Switch to backup procedures',
              '5. Network issues: Use offline protocols',
              '6. Always acknowledge alerts to clear them'
            ],
            warnings: [
              'Never ignore red system alerts',
              'Don\'t dismiss alerts without reading',
              'Report recurring alerts to IT',
              'Follow downtime procedures exactly'
            ],
            tips: [
              'Set up alert prioritization',
              'Keep backup procedures accessible',
              'Test emergency contacts regularly',
              'Document all system issues'
            ]
          },
          printable: true,
          lastUpdated: new Date('2025-01-15'),
          version: '1.0'
        }
      ];

      // Store all cards
      cards.forEach(card => {
        this.cards.set(card.id, card);
      });

      logger.info('Quick reference cards loaded', {
        count: this.cards.size,
        categories: [...new Set(cards.map(c => c.category))]
      });

    } catch (error) {
      logger.error('Error loading quick reference cards:', error);
      throw error;
    }
  }

  // Get all quick reference cards
  async getAllCards(category?: string): Promise<QuickReferenceCard[]> {
    let cards = Array.from(this.cards.values());

    if (category) {
      cards = cards.filter(card => card.category === category);
    }

    return cards.sort((a, b) => a.title.localeCompare(b.title));
  }

  // Get specific quick reference card
  async getCard(id: string): Promise<QuickReferenceCard | null> {
    return this.cards.get(id) || null;
  }

  // Search quick reference cards
  async searchCards(query: string): Promise<QuickReferenceCard[]> {
    const searchTerm = query.toLowerCase();

    return Array.from(this.cards.values()).filter(card => {
      return (
        card.title.toLowerCase().includes(searchTerm) ||
        card.content.summary.toLowerCase().includes(searchTerm) ||
        card.content.steps?.some(step => step.toLowerCase().includes(searchTerm)) ||
        card.content.tips?.some(tip => tip.toLowerCase().includes(searchTerm))
      );
    });
  }

  // Get cards by category
  async getCardsByCategory(category: string): Promise<QuickReferenceCard[]> {
    return Array.from(this.cards.values())
      .filter(card => card.category === category)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  // Get printable version of a card
  async getPrintableCard(id: string): Promise<string | null> {
    const card = this.cards.get(id);
    if (!card || !card.printable) {
      return null;
    }

    // Generate printable markdown format
    let printable = `# ${card.title}\n\n`;
    printable += `**Category:** ${card.category.toUpperCase()}\n`;
    printable += `**Version:** ${card.version}\n`;
    printable += `**Last Updated:** ${card.lastUpdated.toLocaleDateString()}\n\n`;

    printable += `## Summary\n${card.content.summary}\n\n`;

    if (card.content.steps && card.content.steps.length > 0) {
      printable += `## Steps\n`;
      card.content.steps.forEach((step, index) => {
        printable += `${index + 1}. ${step}\n`;
      });
      printable += '\n';
    }

    if (card.content.warnings && card.content.warnings.length > 0) {
      printable += `## ⚠️ Important Warnings\n`;
      card.content.warnings.forEach(warning => {
        printable += `- ${warning}\n`;
      });
      printable += '\n';
    }

    if (card.content.tips && card.content.tips.length > 0) {
      printable += `## 💡 Pro Tips\n`;
      card.content.tips.forEach(tip => {
        printable += `- ${tip}\n`;
      });
      printable += '\n';
    }

    printable += `---\n*Capitol Eye Care Staff Training Materials*\n`;
    printable += `*For questions or updates, contact Training Department*`;

    return printable;
  }

  // Get available categories
  async getCategories(): Promise<string[]> {
    const categories = new Set<string>();
    this.cards.forEach(card => categories.add(card.category));
    return Array.from(categories).sort();
  }

  // Update a quick reference card (admin only)
  async updateCard(id: string, updates: Partial<QuickReferenceCard>): Promise<QuickReferenceCard | null> {
    const card = this.cards.get(id);
    if (!card) {
      return null;
    }

    const updatedCard: QuickReferenceCard = {
      ...card,
      ...updates,
      lastUpdated: new Date()
    };

    this.cards.set(id, updatedCard);

    logger.info('Quick reference card updated', {
      cardId: id,
      title: updatedCard.title,
      version: updatedCard.version
    });

    return updatedCard;
  }

  // Create a new quick reference card (admin only)
  async createCard(cardData: Omit<QuickReferenceCard, 'lastUpdated'>): Promise<QuickReferenceCard> {
    const card: QuickReferenceCard = {
      ...cardData,
      lastUpdated: new Date()
    };

    this.cards.set(card.id, card);

    logger.info('Quick reference card created', {
      cardId: card.id,
      title: card.title,
      category: card.category
    });

    return card;
  }

  // Get card usage analytics (admin only)
  async getCardAnalytics(): Promise<any> {
    // In a real implementation, this would track actual usage
    // For now, return mock analytics
    return {
      totalCards: this.cards.size,
      cardsByCategory: {
        escalation: Array.from(this.cards.values()).filter(c => c.category === 'escalation').length,
        troubleshooting: Array.from(this.cards.values()).filter(c => c.category === 'troubleshooting').length,
        features: Array.from(this.cards.values()).filter(c => c.category === 'features').length,
        compliance: Array.from(this.cards.values()).filter(c => c.category === 'compliance').length
      },
      mostAccessed: [
        { id: 'escalation-priority-guide', title: 'Escalation Priority Guide', accessCount: 145 },
        { id: 'hipaa-compliance-quick-check', title: 'HIPAA Compliance Quick Check', accessCount: 98 },
        { id: 'troubleshooting-ai-issues', title: 'AI System Troubleshooting', accessCount: 87 }
      ],
      recentlyUpdated: Array.from(this.cards.values())
        .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime())
        .slice(0, 5)
        .map(card => ({
          id: card.id,
          title: card.title,
          lastUpdated: card.lastUpdated,
          version: card.version
        }))
    };
  }
}

export default QuickReferenceService;