export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }

  if (aMagnitude === 0 || bMagnitude === 0) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

export class InMemoryVectorStore {
  constructor(items = []) {
    this.items = items;
  }

  addMany(chunks, embeddings) {
    this.items = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));
  }

  search(queryEmbedding, topK = 4) {
    return this.items
      .map((item) => ({
        ...item,
        score: cosineSimilarity(queryEmbedding, item.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }

  clear() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }
}
