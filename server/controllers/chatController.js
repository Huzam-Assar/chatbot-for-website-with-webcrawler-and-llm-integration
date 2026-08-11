import Message from '../models/Message.js';
import { isDatabaseAvailable } from '../config/db.js';
import { generateAssistantResponse } from '../services/assistantService.js';
import { getStoredMessages, saveStoredMessage } from '../utils/memoryStore.js';

async function storeMessage(conversationId, sender, message, type = 'text') {
  if (isDatabaseAvailable()) {
    try {
      await Message.create({
        conversationId,
        sender,
        message,
        type,
      });
      return;
    } catch (error) {
      console.warn('Unable to persist message to MongoDB. Using memory fallback.', error.message);
    }
  }

  await saveStoredMessage({ conversationId, sender, message, type });
}

async function storeBotMessage(conversationId, message, type = 'text') {
  return storeMessage(conversationId, 'bot', message, type);
}

function createConversationId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function healthCheck(req, res) {
  return res.json({ ok: true, message: 'API is running' });
}

export async function sendMessage(req, res) {
  const { message, conversationId } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const activeConversationId = conversationId || createConversationId();
  const userMessage = message.trim();

  await storeMessage(activeConversationId, 'user', userMessage, 'text');

  let assistantResult;

  try {
    assistantResult = await generateAssistantResponse({
      conversationId: activeConversationId,
      userMessage,
    });
  } catch (error) {
    console.error('Assistant generation failed:', error);
    assistantResult = {
      reply: 'Sorry, I could not generate a response right now.',
      source: 'error',
    };
  }

  await storeBotMessage(activeConversationId, assistantResult.reply, 'text');

  return res.json({
    conversationId: activeConversationId,
    reply: assistantResult.reply,
    source: assistantResult.source,
  });
}

export async function getMessages(req, res) {
  const { conversationId } = req.params;

  let messages = [];

  if (isDatabaseAvailable()) {
    try {
      messages = await Message.find({
        conversationId,
        type: { $ne: 'whatsapp' },
      }).sort({ createdAt: 1 });
    } catch (error) {
      console.warn('Unable to load messages from MongoDB. Using memory fallback.', error.message);
    }
  }

  if (messages.length === 0) {
    messages = await getStoredMessages(conversationId);
  }

  return res.json({ messages });
}