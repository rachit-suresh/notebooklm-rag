import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

function embeddingFor(text) {
  return String(text).toLowerCase().includes("renewable") ? [1, 0] : [0, 1];
}

beforeEach(() => {
  global.fetch = vi.fn(async (url, options) => {
    const payload = JSON.parse(options.body);
    if (String(url).includes("/api/embeddings")) {
      return {
        ok: true,
        json: async () => ({
          embeddings: payload.texts.map(embeddingFor),
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        answer: "The document says renewable energy reduces emissions. [Chunk 1]",
        citations: payload.contexts,
      }),
    };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("uploads a text document, asks a question, and shows sources", async () => {
    const user = userEvent.setup();
    render(<App />);

    const file = new File(
      ["Renewable energy reduces emissions.\n\nPasta needs boiling water."],
      "notes.txt",
      { type: "text/plain" },
    );
    await user.upload(screen.getByLabelText(/upload pdf or text/i), file);

    expect(await screen.findByText("Document indexed")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/ask a question/i), "What reduces emissions?");
    await user.click(screen.getByRole("button", { name: /ask question/i }));

    expect(
      await screen.findByText(
        "The document says renewable energy reduces emissions. [Chunk 1]",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Retrieved Sources")).toBeInTheDocument();
  });

  it("resets the uploaded document", async () => {
    const user = userEvent.setup();
    render(<App />);

    const file = new File(["Short document"], "reset.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText(/upload pdf or text/i), file);
    expect(await screen.findByText("reset.txt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reset document/i }));
    await waitFor(() => expect(screen.getByText("Waiting for upload")).toBeInTheDocument());
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});
