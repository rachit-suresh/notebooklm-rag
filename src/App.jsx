import {
  FileText,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { chunkText } from "./lib/chunking.js";
import { extractPdfText } from "./lib/pdf.js";
import { InMemoryVectorStore } from "./lib/vectorStore.js";

const TOP_K = 4;
const EMBEDDING_BATCH_SIZE = 80;

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
  const statusLabel = useMemo(() => {
    if (status === "reading") return "Reading document";
    if (status === "embedding") return "Embedding chunks";
    if (status === "answering") return "Retrieving answer";
    if (ready) return "Document indexed";
    return "Waiting for upload";
  }, [ready, status]);

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
        <aside className="document-panel">
          <div className="brand">
            <span className="brand-icon" aria-hidden="true">
              <MessageSquareText size={28} />
            </span>
            <div>
              <p>Assignment 03</p>
              <h1>NotebookLM RAG</h1>
            </div>
          </div>

          <label className="upload-zone">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,text/plain,application/pdf"
              onChange={handleFileChange}
            />
            <UploadCloud size={32} aria-hidden="true" />
            <strong>Upload PDF or text</strong>
            <span>Indexed in this browser session</span>
          </label>

          <div className="status-strip">
            <span className={`status-dot ${ready ? "ready" : ""}`} />
            <span>{statusLabel}</span>
            {(status === "reading" || status === "embedding") && (
              <Loader2 className="spin" size={16} aria-hidden="true" />
            )}
          </div>

          <div className="document-stats" aria-label="Document statistics">
            <div>
              <span>File</span>
              <strong>{documentState.name || "None"}</strong>
            </div>
            <div>
              <span>Chunks</span>
              <strong>{documentState.chunks.length}</strong>
            </div>
            <div>
              <span>Characters</span>
              <strong>{documentState.characters.toLocaleString()}</strong>
            </div>
          </div>

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
            <div className="security-note">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>Answers use retrieved chunks only</span>
            </div>
          </header>

          <div className="conversation" aria-live="polite">
            {turns.length === 0 ? (
              <div className="empty-state">
                <FileText size={42} aria-hidden="true" />
                <p>
                  Upload a document to start a grounded conversation with its
                  contents.
                </p>
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
          </div>

          {retrieved.length > 0 && (
            <section className="sources" aria-label="Retrieved source chunks">
              <div className="sources-title">
                <Search size={16} aria-hidden="true" />
                <span>Retrieved Sources</span>
              </div>
              <div className="source-grid">
                {retrieved.map((source) => (
                  <article className="source-card" key={source.id}>
                    <div>
                      <strong>Chunk {source.index}</strong>
                      <span>{source.score.toFixed(3)}</span>
                    </div>
                    <p>{source.text}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

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
