import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
});

export async function healthCheck() {
  const response = await api.get('/health');
  return response.data;
}

export async function sendChatMessage(payload) {
  const response = await api.post('/chat', payload);
  return response.data;
}

export async function getConversationMessages(conversationId) {
  const response = await api.get(`/messages/${conversationId}`);
  return response.data.messages;
}
