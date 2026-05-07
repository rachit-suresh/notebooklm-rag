import { describe, expect, it } from "vitest";
import { InMemoryVectorStore, cosineSimilarity } from "./vectorStore.js";

describe("InMemoryVectorStore", () => {
  it("ranks the most similar chunk first", () => {
    const store = new InMemoryVectorStore();
    store.addMany(
      [
        { id: "a", index: 1, text: "Renewable energy reduces emissions." },
        { id: "b", index: 2, text: "Cooking instructions for pasta." },
      ],
      [
        [0.95, 0.05],
        [0.05, 0.95],
      ],
    );

    const results = store.search([1, 0], 1);
    expect(results[0].id).toBe("a");
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it("returns zero similarity for incompatible vectors", () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
