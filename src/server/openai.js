import OpenAI from "openai";

export function createClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  return new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL:
      process.env.OPENAI_BASE_URL ||
      "https://generativelanguage.googleapis.com/v1beta/openai/",
  });
}

export function chatModel() {
  return process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview";
}

export function embeddingModel() {
  return process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
}
