import { useEffect, useRef, useState } from 'react';
import ChatBubble from './ChatBubble';
import QuickButtons from './QuickButtons';
import MessageInput from './MessageInput';
import Typing from './Typing';
import { getConversationMessages, sendChatMessage } from '../../services/chatService';

const starterMessages = [
  { sender: 'bot', message: 'Hi 👋 Welcome to IntelliFlick.' },
  { sender: 'bot', message: 'How can I help you?' },
  { sender: 'bot', message: 'Select any of the options below or type your query.' },
];

const conversationStorageKey = 'intelliflickConversationId';

export default function ChatBot({ isOpen, onClose }) {
  const [messages, setMessages] = useState(starterMessages);
  const [conversationId, setConversationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef(null);
  const menuRef = useRef(null);
  const followUpTimerRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    return () => {
      if (followUpTimerRef.current) {
        window.clearTimeout(followUpTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const savedConversationId = window.localStorage.getItem(conversationStorageKey);

    if (!savedConversationId) {
      return;
    }

    setConversationId(savedConversationId);

    getConversationMessages(savedConversationId)
      .then((savedMessages) => {
        if (savedMessages.length > 0) {
          setMessages(
            savedMessages.map((entry) => ({
              sender: entry.sender,
              message: entry.message,
              type: entry.type,
            }))
          );
          setShowQuickActions(false);
        }
      })
      .catch(() => {});
  }, []);

  function startNewChat() {
    if (followUpTimerRef.current) {
      window.clearTimeout(followUpTimerRef.current);
    }

    window.localStorage.removeItem(conversationStorageKey);
    setConversationId('');
    setMessages(starterMessages);
    setShowQuickActions(true);
    setMenuOpen(false);
  }

  async function handleSend(message) {
    setMessages((current) => [...current, { sender: 'user', message }]);
    setShowQuickActions(false);
    setLoading(true);

    try {
      const response = await sendChatMessage({ message, conversationId });
      setConversationId(response.conversationId);
      window.localStorage.setItem(conversationStorageKey, response.conversationId);
      setMessages((current) => [...current, { sender: 'bot', message: response.reply }]);
    } catch (error) {
      setMessages((current) => [...current, { sender: 'bot', message: 'The server is currently unavailable, but you can still try one of the quick options above.' }]);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <section className="fixed bottom-24 right-6 z-50 w-[min(92vw,26rem)] sm:right-8">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4 text-white">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-300">IntelliFlick </p>
            <h2 className="mt-2 text-xl font-semibold">Ask anything about IntelliFlick</h2>
          </div>
          <div ref={menuRef} className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="rounded-full px-3 py-2 text-xl leading-none text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Open chat menu"
            >
              ⋯
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Close chat"
            >
              ×
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-12 w-40 overflow-hidden rounded-2xl bg-white p-2 text-slate-800 shadow-2xl shadow-black/20 ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={startNewChat}
                  className="w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-100"
                >
                  New Chat
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 bg-slate-50 px-5 py-5">
          <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-3xl bg-slate-100 p-4">
            {messages.map((message, index) => (
              <ChatBubble
                key={`${message.sender}-${index}-${message.message}`}
                sender={message.sender}
                message={message.message}
                type={message.type}
              />
            ))}
            {loading ? <Typing /> : null}
            <div ref={endRef} />
          </div>

          {showQuickActions ? <QuickButtons onSelect={handleSend} /> : null}
          <MessageInput onSend={handleSend} disabled={loading} />
        </div>
      </div>
    </section>
  );
}
