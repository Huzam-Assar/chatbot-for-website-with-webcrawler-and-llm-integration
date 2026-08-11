import { askGemini, getBuiltInAnswer } from '../utils/gemini.js';
import {
  buildConversationSearchText,
  buildKnowledgeContext,
  extractKnowledgePriceAnswer,
  formatConversationHistory,
  getConversationHistory,
  searchKnowledge,
} from './knowledgeService.js';

function buildAssistantPrompt({ userMessage, history, knowledgeDocuments }) {
  const conversationText = formatConversationHistory(history);
  const knowledgeContext = buildKnowledgeContext(knowledgeDocuments);

  return `You are IntelliFlick Assistant for a production website chatbot.

Behavior rules:
- Answer clearly and briefly.
- Use the conversation history to resolve follow-up questions and pronouns.
- If relevant website knowledge is provided, answer using only that knowledge.
- If the user asks about a product price and the website knowledge contains a price, quote the exact price.
- Never invent phone numbers, email addresses, office addresses, shipping charges, delivery charges, checkout details, payment methods, product details, or service details.
- If the website knowledge does not contain the answer, say you could not find it on the website.
- Write in a human-readable format with short paragraphs and plain text bullets.
- Do not use markdown stars for decoration.
- Avoid a single long paragraph.

Conversation history:
${conversationText || 'No prior conversation.'}

Website knowledge:
${knowledgeContext || 'No relevant crawled website data found.'}

Current user message:
${userMessage}
`;
}

export async function generateAssistantResponse({ conversationId, userMessage }) {
  const builtInAnswer = getBuiltInAnswer(userMessage);

  if (builtInAnswer) {
    return {
      reply: builtInAnswer,
      source: 'builtin',
      history: [],
      knowledgeDocuments: [],
      searchText: userMessage,
    };
  }

  const history = await getConversationHistory(conversationId, 20);
  const searchText = buildConversationSearchText(userMessage, history);
  const knowledgeDocuments = await searchKnowledge(searchText, {
    history,
    limit: 5,
  });

  const directPriceAnswer = extractKnowledgePriceAnswer(knowledgeDocuments, userMessage);

  if (directPriceAnswer) {
    return {
      reply: directPriceAnswer,
      source: 'knowledge',
      history,
      knowledgeDocuments,
      searchText,
    };
  }

  const prompt = buildAssistantPrompt({
    userMessage,
    history,
    knowledgeDocuments,
  });

  const reply = await askGemini(prompt);

  return {
    reply,
    source: knowledgeDocuments.length > 0 ? 'knowledge' : 'gemini',
    history,
    knowledgeDocuments,
    searchText,
  };
}
