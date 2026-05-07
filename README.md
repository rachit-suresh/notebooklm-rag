# NotebookLM RAG

A Google NotebookLM-style Retrieval-Augmented Generation app for Assignment 03.
Users can upload a PDF or plain text document, ask natural-language questions,
and receive answers grounded in retrieved document chunks.

## Live Links

- GitHub Repository: pending push
- Live Project: pending Vercel deployment

## Features

- PDF and `.txt` upload in the browser
- Client-side document text extraction and chunking
- Gemini embeddings through the OpenAI-compatible API
- Session-scoped in-memory vector store with cosine similarity retrieval
- Grounded answer generation through a protected Vercel API function
- Retrieved source chunks displayed with similarity scores

## RAG Pipeline

1. **Ingestion**: The browser reads uploaded `.txt` files directly and extracts
   PDF text with `pdfjs-dist`.
2. **Chunking**: `src/lib/chunking.js` normalizes text, splits it with a
   recursive-style separator strategy, and applies a fixed overlap. Defaults are
   `900` characters per chunk and `160` characters of overlap.
3. **Embedding**: The frontend sends chunk text to `POST /api/embeddings`. The
   Vercel function calls Gemini's OpenAI-compatible embeddings endpoint.
4. **Storage**: Embeddings and chunks are stored in `InMemoryVectorStore` for the
   current browser session.
5. **Retrieval**: Each question is embedded, compared with cosine similarity,
   and the top 4 chunks are selected.
6. **Generation**: `POST /api/answer` sends the question and retrieved chunks to
   Gemini with a system prompt that forbids using outside knowledge.

## Important Limitation

This submission intentionally uses an in-memory vector store to stay on Vercel's
free tier without an external database. Uploaded documents are not persisted
after refresh, browser close, or serverless cold sessions. A production version
should replace this with Qdrant Cloud, Supabase pgvector, Pinecone, or another
persistent vector database.

## Local Setup

```bash
npm install
cp .env.example .env
```

Set these environment variables:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_MODEL=gemini-3.1-flash-lite-preview
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

Run locally with Vercel's dev server so `/api` functions are available:

```bash
vercel dev
```

## Vercel Deployment

Deploy as one Vercel project from the repository root. Add the same environment
variables in Vercel Project Settings before production use:

- `GEMINI_API_KEY`
- `OPENAI_BASE_URL`
- `GEMINI_MODEL`
- `GEMINI_EMBEDDING_MODEL`

## Tests

```bash
npm test
npm run build
```

The test suite covers chunking, vector retrieval, API validation/model calls, and
the upload-to-answer frontend flow.
