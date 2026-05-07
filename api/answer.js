import { readJson, rejectUnsupportedMethod, sendJson } from "../src/server/http.js";
import { chatModel, createClient } from "../src/server/openai.js";

const MAX_CONTEXTS = 6;
const MAX_QUESTION_LENGTH = 1200;

function validatePayload(payload) {
  if (typeof payload.question !== "string" || !payload.question.trim()) {
    return "Ask a non-empty question.";
  }
  if (payload.question.length > MAX_QUESTION_LENGTH) {
    return `Keep the question under ${MAX_QUESTION_LENGTH} characters.`;
  }
  if (!Array.isArray(payload.contexts) || payload.contexts.length === 0) {
    return "No document context was retrieved for this question.";
  }
  if (payload.contexts.length > MAX_CONTEXTS) {
    return `Send at most ${MAX_CONTEXTS} context chunks.`;
  }
  if (
    payload.contexts.some(
      (context) => typeof context.text !== "string" || !context.text.trim(),
    )
  ) {
    return "Every context chunk must include text.";
  }
  return "";
}

function buildContext(contexts) {
  return contexts
    .map((context, index) => {
      const label = context.index || index + 1;
      return `[Chunk ${label} | score ${Number(context.score || 0).toFixed(3)}]\n${context.text}`;
    })
    .join("\n\n---\n\n");
}

export default async function handler(request, response) {
  if (rejectUnsupportedMethod(request, response)) return;

  try {
    const payload = await readJson(request);
    const error = validatePayload(payload);
    if (error) {
      sendJson(response, 400, { detail: error });
      return;
    }

    const contexts = payload.contexts.slice(0, MAX_CONTEXTS);
    const client = createClient();
    const completion = await client.chat.completions.create({
      model: chatModel(),
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            "You are a document-grounded RAG assistant. Answer only from the retrieved document context. If the context does not contain the answer, say: \"I could not find that in the uploaded document.\" Do not use outside knowledge. Cite useful chunks inline as [Chunk N].",
        },
        {
          role: "user",
          content: `Question:\n${payload.question}\n\nRetrieved document context:\n${buildContext(contexts)}`,
        },
      ],
    });

    const answer = completion.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      sendJson(response, 502, {
        detail: "The model returned an empty answer. Please try again.",
      });
      return;
    }

    sendJson(response, 200, {
      answer,
      citations: contexts.map((context) => ({
        index: context.index,
        source: context.source,
        score: context.score,
        preview: context.text.slice(0, 240),
      })),
      model: chatModel(),
    });
  } catch (error) {
    const isConfigurationError = error.message?.includes("GEMINI_API_KEY");
    sendJson(response, isConfigurationError ? 503 : 502, {
      detail: isConfigurationError
        ? "The backend is missing GEMINI_API_KEY."
        : "The answer service could not respond right now.",
    });
  }
}
