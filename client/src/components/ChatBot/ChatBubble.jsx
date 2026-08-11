function sanitizePlainText(text) {
  return text.replace(/\*/g, '');
}

function renderInline(message) {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const boldPattern = /\*\*([^*]+)\*\*/g;
  const parts = [];
  let cursor = 0;
  let match;

  while ((match = linkPattern.exec(message)) !== null) {
    if (match.index > cursor) {
      parts.push(...renderBold(message.slice(cursor, match.index)));
    }

    parts.push(
      <a
        key={`${match[2]}-${match.index}`}
        href={match[2]}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-amber-600 underline underline-offset-2"
      >
        {match[1]}
      </a>
    );

    cursor = match.index + match[0].length;
  }

  if (cursor < message.length) {
    parts.push(...renderBold(message.slice(cursor)));
  }

  function renderBold(text) {
    const boldParts = [];
    let boldCursor = 0;
    let boldMatch;

    boldPattern.lastIndex = 0;

    while ((boldMatch = boldPattern.exec(text)) !== null) {
      if (boldMatch.index > boldCursor) {
        boldParts.push(sanitizePlainText(text.slice(boldCursor, boldMatch.index)));
      }

      boldParts.push(
        <strong key={`${boldMatch[1]}-${boldMatch.index}`} className="font-semibold">
          {boldMatch[1]}
        </strong>
      );

      boldCursor = boldMatch.index + boldMatch[0].length;
    }

    if (boldCursor < text.length) {
      boldParts.push(sanitizePlainText(text.slice(boldCursor)));
    }

    return boldParts;
  }

  return parts.length > 0 ? parts : message;
}

function formatMessage(message) {
  const normalized = message
    .replace(/\r\n/g, '\n')
    .replace(/\s+\*\*\s+/g, ' **')
    .replace(/\*\*(.*?)\*\*/g, '**$1**')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(?<!\n)([•*-]\s+)/g, '\n$1')
    .replace(/(?<!\n)(\d+\.\s+)/g, '\n$1')
    .trim();

  const paragraphs = normalized.split(/\n\n+/);

  return paragraphs.map((paragraph, paragraphIndex) => {
    const lines = paragraph.split('\n').filter(Boolean);

    if (lines.length === 0) {
      return null;
    }

    const isList = lines.every((line) => /^([•*-]|\d+\.)\s+/.test(line.trim()));

    if (isList) {
      return (
        <ul key={`list-${paragraphIndex}`} className="space-y-1">
          {lines.map((line, lineIndex) => (
            <li key={`${paragraphIndex}-${lineIndex}`} className="flex gap-2">
              <span className="mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
              <span>{renderInline(line.replace(/^([•*-]|\d+\.)\s+/, ''))}</span>
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={`para-${paragraphIndex}`} className="whitespace-pre-line">
        {renderInline(lines.join(' '))}
      </p>
    );
  });
}

export default function ChatBubble({ sender, message }) {
  const isUser = sender === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm whitespace-pre-line ${
          isUser ? 'bg-slate-950 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200'
        }`}
      >
        <div className="space-y-2">{formatMessage(message)}</div>
      </div>
    </div>
  );
}
