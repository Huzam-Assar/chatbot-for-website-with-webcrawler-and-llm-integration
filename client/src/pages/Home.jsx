import { useState } from 'react';
import { FaCommentDots, FaTimes } from 'react-icons/fa';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Footer from '../components/Footer';
import ChatBot from '../components/ChatBot/ChatBot';

export default function Home() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <ChatBot isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      </main>
      <Footer />

      {!chatOpen ? (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-3 rounded-full bg-amber-700 px-5 py-4 text-sm font-semibold text-white shadow-2xl shadow-amber-700/25 transition hover:-translate-y-0.5 hover:bg-amber-800"
        >
          <FaCommentDots />
          Open Chat
        </button>
      ) : null}
    </div>
  );
}
