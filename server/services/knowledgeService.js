import CrawledPage from '../models/CrawledPage.js';
import Message from '../models/Message.js';
import { isDatabaseAvailable } from '../config/db.js';
import { getStoredMessages } from '../utils/memoryStore.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'we',
  'what',
  'when',
  'where',
  'who',
  'why',
  'will',
  'with',
  'you',
  'your',
]);

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isPriceIntent(question) {
  const normalized = cleanWhitespace(question.toLowerCase());
  return /\b(price|cost|charge|charges|fee|fees|amount|rate|rates|proce|pricing|how much|estimate)\b/.test(normalized);
}

function extractPriceMatches(text) {
  const matches = [];
  const patterns = [
    /(?:rs\.?)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi,
    /(?:inr)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi,
    /\$\s*\d+(?:,\d{3})*(?:\.\d+)?/g,
    /\d+(?:,\d{3})*(?:\.\d+)?\s*(?:rs|inr|usd|dollars?)/gi,
  ];

  for (const pattern of patterns) {
    const found = text.match(pattern) || [];
    for (const value of found) {
      const normalized = cleanWhitespace(value);
      if (normalized && !matches.includes(normalized)) {
        matches.push(normalized);
      }
    }
  }

  return matches;
}

function normalizeTerms(text) {
  return cleanWhitespace(text.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));
}

function countOccurrences(text, term) {
  let count = 0;
  let index = 0;

  while (true) {
    index = text.indexOf(term, index);
    if (index === -1) {
      break;
    }

    count += 1;
    index += term.length;
  }

  return count;
}

function pickBestSegment(text, terms) {
  const normalized = cleanWhitespace(text);

  if (!normalized) {
    return '';
  }

  const segments = normalized
    .split(/(?:\n+|(?<=[.!?]))\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return normalized.slice(0, 300);
  }

  let bestSegment = segments[0];
  let bestScore = -1;

  for (const segment of segments) {
    const lower = segment.toLowerCase();
    let score = 0;

    for (const term of terms) {
      score += countOccurrences(lower, term);
    }

    if (score > bestScore) {
      bestScore = score;
      bestSegment = segment;
    }
  }

  if (bestScore <= 0) {
    return normalized.slice(0, 300);
  }

  const targetIndex = normalized.indexOf(bestSegment);
  const start = Math.max(0, targetIndex - 80);
  const end = Math.min(normalized.length, targetIndex + bestSegment.length + 120);

  return cleanWhitespace(normalized.slice(start, end));
}

function buildSearchText(question, history = []) {
  const historyTerms = history
    .slice(-8)
    .map((message) => message.message || '')
    .join(' ');

  return cleanWhitespace(`${historyTerms} ${question}`);
}

function scoreDocument(document, terms) {
  const title = (document.title || '').toLowerCase();
  const headings = Array.isArray(document.headings) ? document.headings.join(' ').toLowerCase() : '';
  const mainContent = (document.mainContent || '').toLowerCase();
  const footerContent = (document.footerContent || '').toLowerCase();
  const combined = `${title}\n${headings}\n${mainContent}\n${footerContent}`;
  const priceIntent = terms.some((term) => ['price', 'cost', 'charge', 'charges', 'fee', 'fees', 'amount', 'rate', 'rates', 'howmuch'].includes(term));
  const productIntent = terms.some((term) => ['product', 'products', 'item', 'items', 'stock', 'buy', 'purchase'].includes(term));

  let score = Number(document.textScore || 0) * 10;

  for (const term of terms) {
    const occurrences = countOccurrences(combined, term);
    if (occurrences > 0) {
      score += Math.min(occurrences, 6);
    }

    if (title.includes(term)) {
      score += 5;
    }

    if (headings.includes(term)) {
      score += 4;
    }

    if (mainContent.includes(term)) {
      score += 2;
    }

    if (footerContent.includes(term)) {
      score += 3;
    }
  }

  const contactIntent = terms.some((term) =>
    ['contact', 'phone', 'email', 'address', 'location', 'office', 'shipping', 'delivery', 'payment', 'checkout', 'product', 'service'].includes(term)
  );

  if (contactIntent && /phone|email|address|contact|shipping|delivery|payment|checkout|service|product/.test(combined)) {
    score += 8;
  }

  if (priceIntent) {
    const priceSignals = /(?:rs\.?\s*\d+|inr\s*\d+|\$\s*\d+|\d+\s*(?:rs|inr|usd|dollars?)|price|cost|charge|fee)/.test(combined);
    if (priceSignals) {
      score += 12;
    }
  }

  if (productIntent && /product|item|sku|variant|specification|specs|buy|add to cart|stock/.test(combined)) {
    score += 6;
  }

  return score;
}

function buildDocumentText(document) {
  return cleanWhitespace([
    document.title || '',
    Array.isArray(document.headings) ? document.headings.join(' ') : '',
    document.mainContent || '',
    document.footerContent || '',
    document.url || '',
    document.canonicalUrl || '',
    document.sourceUrl || '',
  ].join(' '));
}

function buildKnowledgeSnippet(document, terms) {
  const mainSnippet = pickBestSegment(document.mainContent || '', terms);
  const footerSnippet = pickBestSegment(document.footerContent || '', terms);
  const headingSnippet = Array.isArray(document.headings) ? document.headings.slice(0, 6).join(' | ') : '';
  const priceMatch = (document.mainContent || document.footerContent || '').match(/(?:rs\.?\s*\d+(?:,\d{3})*(?:\.\d+)?|inr\s*\d+(?:,\d{3})*(?:\.\d+)?|\$\s*\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?\s*(?:rs|inr|usd|dollars?))/i);

  const lines = [];

  if (headingSnippet) {
    lines.push(`Headings: ${headingSnippet}`);
  }

  if (mainSnippet) {
    lines.push(`Main: ${mainSnippet}`);
  }

  if (footerSnippet && footerSnippet !== mainSnippet) {
    lines.push(`Footer: ${footerSnippet}`);
  }

  if (priceMatch) {
    lines.push(`Price: ${priceMatch[0]}`);
  }

  return lines.join('\n');
}

export function buildConversationSearchText(question, history = []) {
  return buildSearchText(question, history);
}

export async function getConversationHistory(conversationId, limit = 20) {
  if (!conversationId) {
    return [];
  }

  if (!isDatabaseAvailable()) {
    const memoryMessages = await getStoredMessages(conversationId);
    return memoryMessages.slice(-limit).reverse();
  }

  try {
    const messages = await Message.find({ conversationId })
      .where({ type: { $ne: 'whatsapp' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return messages.reverse();
  } catch (error) {
    console.warn('Conversation history lookup failed. Using memory history.', error.message);
    const memoryMessages = await getStoredMessages(conversationId);
    return memoryMessages.slice(-limit).reverse();
  }
}

export function formatConversationHistory(history) {
  return history
    .map((message) => {
      const label = message.sender === 'user' ? 'User' : 'Assistant';
      return `${label}: ${cleanWhitespace(message.message || '')}`;
    })
    .join('\n');
}

export async function searchKnowledge(question, { history = [], limit = 5 } = {}) {
  const searchText = buildSearchText(question, history);
  const terms = normalizeTerms(searchText);
  const priceIntent = isPriceIntent(question);

  if (terms.length === 0 || !isDatabaseAvailable()) {
    return [];
  }

  try {
    const textSearchQuery = terms.join(' ');
    const textQueryCandidates = await CrawledPage.find(
      { $text: { $search: textSearchQuery } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(Math.max(limit * 4, 10))
      .lean();

    let candidates = textQueryCandidates;

    if (candidates.length === 0) {
      const regexTerms = terms.slice(0, 5).map((term) => new RegExp(escapeRegex(term), 'i'));
      if (regexTerms.length > 0) {
        candidates = await CrawledPage.find(
          {
            $or: regexTerms.flatMap((term) => [
              { title: term },
              { headings: term },
              { mainContent: term },
              { footerContent: term },
              { url: term },
              { sourceUrl: term },
              { canonicalUrl: term },
            ]),
          },
          { score: 1 }
        )
          .limit(Math.max(limit * 4, 10))
          .lean();
      }
    }

    const ranked = candidates
      .map((document) => ({
        ...document,
        relevanceScore: scoreDocument(document, terms),
        snippet: buildKnowledgeSnippet(document, terms),
        directPriceMatches: priceIntent ? extractPriceMatches(buildDocumentText(document)) : [],
      }))
      .sort((left, right) => {
        if (right.relevanceScore !== left.relevanceScore) {
          return right.relevanceScore - left.relevanceScore;
        }

        return new Date(right.lastCrawled || 0) - new Date(left.lastCrawled || 0);
      })
      .slice(0, limit);

    return ranked;
  } catch (error) {
    console.warn('Knowledge search failed. Returning no knowledge context.', error.message);
    return [];
  }
}

export function extractKnowledgePriceAnswer(documents, question) {
  if (!isPriceIntent(question) || !documents || documents.length === 0) {
    return null;
  }

  const productName = cleanWhitespace(question)
    .replace(/\b(what|is|the|price|cost|of|for|how|much|estimate|tell|me|about)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const document of documents) {
    const priceMatches = Array.isArray(document.directPriceMatches) ? document.directPriceMatches : [];
    if (priceMatches.length > 0) {
      const priceText = priceMatches[0];
      if (productName) {
        return `The price of ${productName} is ${priceText}.`;
      }

      return `The price is ${priceText}.`;
    }
  }

  return null;
}

export function buildKnowledgeContext(documents) {
  if (!documents || documents.length === 0) {
    return '';
  }

  return documents
    .map((document, index) => {
      const headings = Array.isArray(document.headings) && document.headings.length > 0 ? document.headings.join(' | ') : 'None';
      const snippet = document.snippet || '';

      return [
        `[Source ${index + 1}]`,
        `URL: ${document.url}`,
        `Title: ${document.title}`,
        `Headings: ${headings}`,
        `Snippet: ${snippet}`,
      ].join('\n');
    })
    .join('\n\n');
}
