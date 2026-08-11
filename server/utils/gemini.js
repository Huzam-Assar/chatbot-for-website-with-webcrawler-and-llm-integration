import { GoogleGenAI } from '@google/genai';

const builtInAnswers = {
  hi: "Hello! I can help you get started with CVs, projects, teaching, or payments.",
  hello: "Hello! I can help you get started with CVs, projects, teaching, or payments.",
  hey: "Hey! I can help you get started with CVs, projects, teaching, or payments.",
  help: "I can help with creating a CV, posting a project, becoming a teacher, or payment questions.",
  "create cv":
    "Use the Open Chat flow to get started, then we can tailor your CV based on your role, skills, and experience.",

  "post project":
    "Click Post Project in the quick buttons and share your project details, budget, and timeline.",

  "become teacher":
    "Choose Become Teacher to tell us what subject you teach and your availability.",

  payments:
    "Payments are handled through the app once your profile and service details are set up.",
};

function normalizeQuestion(question) {
  return question
    .trim()
    .toLowerCase()
    .replace(/[?.!]/g, "");
}

export function getBuiltInAnswer(question) {
  const normalized = normalizeQuestion(question);
  return builtInAnswers[normalized] || null;
}

export async function askGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return "I’m running in offline mode right now. Try one of the quick options above or ask about services and support.";
  }

  const ai = new GoogleGenAI({
    apiKey,
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: prompt,
  });

  return (
    response.text?.trim() ||
    "Sorry, I could not generate a response right now."
  );
}