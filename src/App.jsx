import {
  Activity,
  BadgeCheck,
  BookOpenText,
  Database,
  FileText,
  Gauge,
  Layers3,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { chunkText } from "./lib/chunking.js";
import { extractPdfText } from "./lib/pdf.js";
import { InMemoryVectorStore } from "./lib/vectorStore.js";

const TOP_K = 4;
const EMBEDDING_BATCH_SIZE = 80;

const SAMPLE_QUESTIONS = [
  "Summarize the document in five bullets.",
  "What are the most important facts?",
  "Where does the document mention risks or limitations?",
];

const STATUS_COPY = {
  idle: {
    label: "Waiting for upload",
    tone: "idle",
    detail: "Drop in a PDF or text file.",
  },
  reading: {
    label: "Reading document",
    tone: "busy",
    detail: "Extracting clean text.",
  },
  embedding: {
    label: "Embedding chunks",
    tone: "busy",
    detail: "Building searchable vectors.",
  },
  ready: {
    label: "Document indexed",
    tone: "ready",
    detail: "Ready for grounded questions.",
  },
  answering: {
    label: "Retrieving answer",
    tone: "busy",
    detail: "Ranking chunks and composing.",
  },
};

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "The request failed.");
  }
  return data;
}

async function embedTexts(texts) {
  const embeddings = [];
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const data = await postJson("/api/embeddings", { texts: batch });
    embeddings.push(...data.embeddings);
  }
  return embeddings;
}

async function readDocument(file) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(file);
  }
  return file.text();
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function App() {
  const storeRef = useRef(new InMemoryVectorStore());
  const fileInputRef = useRef(null);
  const [documentState, setDocumentState] = useState({
    name: "",
    chunks: [],
    characters: 0,
  });
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState([]);
  const [retrieved, setRetrieved] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const ready = storeRef.current.size > 0;
  const activeStatus = useMemo(() => {
    if (status === "reading" || status === "embedding" || status === "answering") {
      return STATUS_COPY[status];
    }
    return ready ? STATUS_COPY.ready : STATUS_COPY.idle;
  }, [ready, status]);

  const statusLabel = activeStatus.label;
  const chromeStatusLabel = useMemo(() => {
    if (status === "reading") return "Reading";
    if (status === "embedding") return "Indexing";
    if (status === "answering") return "Answering";
    if (ready) return "Indexed";
    return "Standby";
  }, [ready, status]);
  const progress = useMemo(() => {
    if (status === "reading") return 38;
    if (status === "embedding") return 72;
    if (status === "answering") return 86;
    if (ready) return 100;
    return 12;
  }, [ready, status]);

  const latestTurn = turns.at(-1);
  const documentPreview = documentState.chunks
    .slice(0, 3)
    .map((chunk) => chunk.text.replace(/\s+/g, " ").slice(0, 90))
    .filter(Boolean);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setTurns([]);
    setRetrieved([]);
    storeRef.current.clear();

    try {
      setStatus("reading");
      const text = await readDocument(file);
      const chunks = chunkText(text, {
        source: file.name.replace(/\W+/g, "-").toLowerCase(),
      });
      if (chunks.length === 0) {
        throw new Error("No readable text was found in this document.");
      }

      setStatus("embedding");
      const embeddings = await embedTexts(chunks.map((chunk) => chunk.text));
      storeRef.current.addMany(chunks, embeddings);
      setDocumentState({
        name: file.name,
        chunks,
        characters: text.length,
      });
      setStatus("ready");
    } catch (uploadError) {
      setDocumentState({ name: "", chunks: [], characters: 0 });
      setStatus("idle");
      setError(uploadError.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAsk(event) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !ready || status === "answering") return;

    setQuestion("");
    setError("");
    setStatus("answering");

    try {
      const [queryEmbedding] = await embedTexts([trimmedQuestion]);
      const contexts = storeRef.current.search(queryEmbedding, TOP_K);
      setRetrieved(contexts);
      const data = await postJson("/api/answer", {
        question: trimmedQuestion,
        contexts,
      });
      setTurns((current) => [
        ...current,
        {
          question: trimmedQuestion,
          answer: data.answer,
          citations: data.citations,
        },
      ]);
      setStatus("ready");
    } catch (askError) {
      setStatus("ready");
      setError(askError.message);
      setTurns((current) => [
        ...current,
        {
          question: trimmedQuestion,
          answer: "",
          citations: [],
        },
      ]);
    }
  }

  function askSampleQuestion(text) {
    if (!ready || status === "answering") return;
    setQuestion(text);
  }

  function resetDocument() {
    storeRef.current.clear();
    setDocumentState({ name: "", chunks: [], characters: 0 });
    setQuestion("");
    setTurns([]);
    setRetrieved([]);
    setError("");
    setStatus("idle");
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="NotebookLM RAG workspace">
        <div className="workspace-chrome">
          <div className="brand">
            <span className="brand-icon" aria-hidden="true">
              <MessageSquareText size={27} />
            </span>
            <div>
              <p>Assignment 03</p>
              <h1>NotebookLM RAG</h1>
            </div>
          </div>

          <div className="chrome-actions" aria-label="Workspace status">
            <span className={`live-pill ${activeStatus.tone}`}>
              <Activity size={15} aria-hidden="true" />
              {chromeStatusLabel}
            </span>
            <span className="model-pill">Gemini RAG</span>
          </div>
        </div>

        <aside className="document-panel">
          <label className="upload-zone">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,text/plain,application/pdf"
              onChange={handleFileChange}
            />
            <span className="upload-aura" aria-hidden="true">
              <UploadCloud size={34} />
            </span>
            <strong>Upload PDF or text</strong>
            <span>{ready ? "Loaded into session" : "Drag, drop, browse"}</span>
          </label>

          <section className="index-console" aria-label="Indexing status">
            <div className="console-header">
              <div>
                <span>Pipeline</span>
                <strong>{statusLabel}</strong>
              </div>
              {(status === "reading" || status === "embedding" || status === "answering") && (
                <Loader2 className="spin" size={18} aria-hidden="true" />
              )}
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
            <p>{activeStatus.detail}</p>
          </section>

          <div className="document-stats" aria-label="Document statistics">
            <article>
              <FileText size={18} aria-hidden="true" />
              <span>File</span>
              <strong>{documentState.name || "None"}</strong>
            </article>
            <article>
              <Layers3 size={18} aria-hidden="true" />
              <span>Chunks</span>
              <strong>{documentState.chunks.length}</strong>
            </article>
            <article>
              <Database size={18} aria-hidden="true" />
              <span>Characters</span>
              <strong>{formatNumber(documentState.characters)}</strong>
            </article>
          </div>

          <section className="document-map" aria-label="Document map">
            <div className="section-kicker">
              <BookOpenText size={16} aria-hidden="true" />
              <span>Document Map</span>
            </div>
            {documentPreview.length > 0 ? (
              <div className="preview-list">
                {documentPreview.map((preview, index) => (
                  <p key={`${preview}-${index}`}>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    {preview}
                  </p>
                ))}
              </div>
            ) : (
              <div className="preview-empty">No document loaded.</div>
            )}
          </section>

          <button className="ghost-button" type="button" onClick={resetDocument}>
            <RefreshCw size={16} />
            <span>Reset document</span>
          </button>
        </aside>

        <section className="chat-panel">
          <header className="chat-header">
            <div>
              <p>Grounded document chat</p>
              <h2>Ask questions from the uploaded file</h2>
            </div>
            <div className="header-metrics">
              <span>
                <ShieldCheck size={17} aria-hidden="true" />
                Context only
              </span>
              <span>
                <Gauge size={17} aria-hidden="true" />
                Top {TOP_K}
              </span>
            </div>
          </header>

          <div className="query-starters" aria-label="Question starters">
            {SAMPLE_QUESTIONS.map((sample) => (
              <button
                key={sample}
                type="button"
                disabled={!ready || status === "answering"}
                onClick={() => askSampleQuestion(sample)}
              >
                <Sparkles size={15} aria-hidden="true" />
                <span>{sample}</span>
              </button>
            ))}
          </div>

          <div className="conversation" aria-live="polite">
            {turns.length === 0 ? (
              <div className="empty-state">
                <span className="empty-emblem" aria-hidden="true">
                  <BadgeCheck size={38} />
                </span>
                <p>Upload a document to start a grounded conversation with its contents.</p>
              </div>
            ) : (
              turns.map((turn, index) => (
                <article className="turn" key={`${turn.question}-${index}`}>
                  <div className="question">
                    <span>You</span>
                    <p>{turn.question}</p>
                  </div>
                  <div className="answer">
                    <span>RAG Assistant</span>
                    <p>{turn.answer || "No answer was returned."}</p>
                  </div>
                </article>
              ))
            )}

            {status === "answering" && (
              <article className="turn pending">
                <div className="answer">
                  <span>RAG Assistant</span>
                  <p>Ranking the strongest chunks...</p>
                </div>
              </article>
            )}
          </div>

          <section className="insight-deck" aria-label="Answer and source summary">
            <article className="answer-snapshot">
              <div className="section-kicker">
                <MessageSquareText size={16} aria-hidden="true" />
                <span>Latest Answer</span>
              </div>
              <p>
                {latestTurn
                  ? `${turns.length} grounded answer${turns.length === 1 ? "" : "s"} in the transcript.`
                  : "No answer yet."}
              </p>
            </article>

            <article className="sources" aria-label="Retrieved source chunks">
              <div className="sources-title">
                <Search size={16} aria-hidden="true" />
                <span>Retrieved Sources</span>
              </div>
              {retrieved.length > 0 ? (
                <div className="source-grid">
                  {retrieved.map((source) => (
                    <article className="source-card" key={source.id}>
                      <div className="source-meta">
                        <strong>Chunk {source.index}</strong>
                        <span>{source.score.toFixed(3)}</span>
                      </div>
                      <div className="score-track" aria-hidden="true">
                        <span style={{ width: `${Math.max(8, source.score * 100)}%` }} />
                      </div>
                      <p>{source.text}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="source-empty">Sources appear after the first question.</div>
              )}
            </article>
          </section>

          {error && <div className="error-banner">{error}</div>}

          <form className="composer" onSubmit={handleAsk}>
            <label className="sr-only" htmlFor="question">
              Ask a question
            </label>
            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={ready ? "Ask anything from the document" : "Upload a document first"}
              disabled={!ready || status === "answering"}
              rows={1}
            />
            <button
              type="submit"
              disabled={!ready || !question.trim() || status === "answering"}
              aria-label="Ask question"
            >
              {status === "answering" ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <Send size={18} />
              )}
              <span>Ask</span>
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

export default App;
