import { readJson, rejectUnsupportedMethod, sendJson } from "../src/server/http.js";
import { createClient, embeddingModel } from "../src/server/openai.js";

const MAX_TEXTS = 100;
const MAX_TEXT_LENGTH = 9000;

function validateTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return "Send at least one text item to embed.";
  }
  if (texts.length > MAX_TEXTS) {
    return `Embed at most ${MAX_TEXTS} text items per request.`;
  }
  if (texts.some((text) => typeof text !== "string" || !text.trim())) {
    return "Every text item must be a non-empty string.";
  }
  if (texts.some((text) => text.length > MAX_TEXT_LENGTH)) {
    return `Each text item must be ${MAX_TEXT_LENGTH} characters or fewer.`;
  }
  return "";
}

export default async function handler(request, response) {
  if (rejectUnsupportedMethod(request, response)) return;

  try {
    const payload = await readJson(request);
    const error = validateTexts(payload.texts);
    if (error) {
      sendJson(response, 400, { detail: error });
      return;
    }

    const client = createClient();
    const result = await client.embeddings.create({
      model: embeddingModel(),
      input: payload.texts,
    });

    sendJson(response, 200, {
      embeddings: result.data.map((item) => item.embedding),
      model: embeddingModel(),
    });
  } catch (error) {
    const isConfigurationError = error.message?.includes("GEMINI_API_KEY");
    sendJson(response, isConfigurationError ? 503 : 502, {
      detail: isConfigurationError
        ? "The backend is missing GEMINI_API_KEY."
        : "The embedding service could not process the document right now.",
    });
  }
}
