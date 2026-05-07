import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embeddingsCreate: vi.fn(),
  completionsCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn(function OpenAI() {
    return {
      embeddings: { create: mocks.embeddingsCreate },
      chat: { completions: { create: mocks.completionsCreate } },
    };
  }),
}));

const { default: embeddingsHandler } = await import("../../api/embeddings.js");
const { default: answerHandler } = await import("../../api/answer.js");

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

describe("api handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-chat-model";
    process.env.GEMINI_EMBEDDING_MODEL = "test-embedding-model";
  });

  it("returns embeddings from the configured OpenAI-compatible client", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }],
    });
    const response = createResponse();

    await embeddingsHandler(
      { method: "POST", body: { texts: ["hello document"] } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().embeddings).toEqual([[0.1, 0.2]]);
    expect(mocks.embeddingsCreate).toHaveBeenCalledWith({
      model: "test-embedding-model",
      input: ["hello document"],
    });
  });

  it("validates embedding payloads", async () => {
    const response = createResponse();
    await embeddingsHandler({ method: "POST", body: { texts: [] } }, response);
    expect(response.statusCode).toBe(400);
    expect(response.json().detail).toMatch(/at least one/i);
  });

  it("asks the chat model with retrieved context only", async () => {
    mocks.completionsCreate.mockResolvedValue({
      choices: [{ message: { content: "It says renewable energy helps. [Chunk 1]" } }],
    });
    const response = createResponse();

    await answerHandler(
      {
        method: "POST",
        body: {
          question: "What helps?",
          contexts: [{ index: 1, source: "doc", score: 0.92, text: "Renewable energy helps." }],
        },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().answer).toContain("renewable energy");
    expect(mocks.completionsCreate.mock.calls[0][0].messages[0].content).toMatch(
      /Answer only from the retrieved document context/i,
    );
  });
});
