import { describe, expect, it } from "vitest";
import { chunkText } from "./chunking.js";

describe("chunkText", () => {
  it("preserves source order while splitting long text", () => {
    const text = [
      "Alpha introduces the document.",
      "Beta explains the middle of the document.",
      "Gamma closes the document.",
    ].join("\n\n");

    const chunks = chunkText(text, {
      chunkSize: 48,
      overlap: 10,
      source: "sample",
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].index).toBe(1);
    expect(chunks[0].text).toContain("Alpha");
    expect(chunks.at(-1).text).toContain("Gamma");
    expect(chunks.every((chunk) => chunk.source === "sample")).toBe(true);
  });

  it("adds overlap after the first chunk", () => {
    const chunks = chunkText("First sentence. Second sentence. Third sentence.", {
      chunkSize: 20,
      overlap: 8,
      source: "overlap",
    });

    expect(chunks[1].text.length).toBeGreaterThan("Second sentence".length);
  });
});
