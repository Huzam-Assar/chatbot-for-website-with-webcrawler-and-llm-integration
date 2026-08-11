import { useState } from 'react';

export default function MessageInput({ onSend, disabled }) {
  const [value, setValue] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (!value.trim()) {
      return;
    }

    onSend(value);
    setValue('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Ask something..."
        className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-950"
        disabled={disabled}
      />
      <button
        type="submit"
        className="rounded-2xl bg-amber-500 px-5 py-3 font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
      >
        Send
      </button>
    </form>
  );
}
