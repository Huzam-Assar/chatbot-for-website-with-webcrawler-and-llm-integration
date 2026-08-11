const messageStore = new Map();

export async function saveStoredMessage({ conversationId, sender, message, type = 'text' }) {
  const conversationMessages = messageStore.get(conversationId) || [];
  const entry = {
    conversationId,
    sender,
    message,
    type,
    createdAt: new Date().toISOString(),
  };

  conversationMessages.push(entry);
  messageStore.set(conversationId, conversationMessages);
  return entry;
}

export async function getStoredMessages(conversationId) {
  const conversationMessages = messageStore.get(conversationId) || [];
  return conversationMessages.map((entry) => ({ ...entry }));
}
