import type { ComponentProps } from "react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ExtraProps } from "react-markdown";

type CodeProps = ComponentProps<"code"> & ExtraProps & { inline?: boolean };

export default function Home() {
  const [url, setUrl] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAnswer("");
    setStatus("Starting...");

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, question: q }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "token") {
                setAnswer((prev) => prev + data.content);
                setStatus("");
              } else if (data.type === "tool_start") {
                setStatus(`Running: ${data.tool}...`);
              } else if (data.type === "tool_end") {
                setStatus(`Completed: ${data.tool}`);
              } else if (data.type === "done") {
                setStatus("Done!");
                setTimeout(() => setStatus(""), 2000);
              } else if (data.type === "error") {
                setAnswer(`Error: ${data.message}`);
                setStatus("");
              }
            } catch (parseError) {
              console.error("Failed to parse SSE data:", parseError);
            }
          }
        }
      }
    } catch (err: any) {
      setAnswer(err.message || "Request failed");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "40px auto",
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        YouTube Researcher
      </h1>
      <p style={{ color: "#555", marginBottom: 24 }}>
        Paste a YouTube URL and ask a question. The app indexes the transcript
        in Pinecone, then answers via RAG.
      </p>

      <form onSubmit={onAsk} style={{ display: "grid", gap: 12 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          required
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g., What are the key takeaways?"
          required
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Thinking..." : "Ask"}
        </button>

        {status && (
          <div
            style={{
              padding: "8px 12px",
              background: "#e3f2fd",
              color: "#1976d2",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {status}
          </div>
        )}
      </form>

      {answer && (
        <div
          style={{
            marginTop: 20,
            padding: 20,
            background: "#ffffff",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            lineHeight: 1.6,
            color: "#1a1a1a",
          }}
          className="markdown-content"
        >
          <ReactMarkdown
            components={{
              h1: ({ node, ...props }) => (
                <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, marginTop: 20, color: "#111" }} {...props} />
              ),
              h2: ({ node, ...props }) => (
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, marginTop: 16, color: "#111" }} {...props} />
              ),
              h3: ({ node, ...props }) => (
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10, marginTop: 14, color: "#111" }} {...props} />
              ),
              p: ({ node, ...props }) => (
                <p style={{ marginBottom: 12, color: "#333" }} {...props} />
              ),
              ul: ({ node, ...props }) => (
                <ul style={{ marginLeft: 20, marginBottom: 12, color: "#333" }} {...props} />
              ),
              ol: ({ node, ...props }) => (
                <ol style={{ marginLeft: 20, marginBottom: 12, color: "#333" }} {...props} />
              ),
              li: ({ node, ...props }) => (
                <li style={{ marginBottom: 6, color: "#333" }} {...props} />
              ),
              strong: ({ node, ...props }) => (
                <strong style={{ fontWeight: 600, color: "#0d47a1" }} {...props} />
              ),
              code: ({ node, inline, ...props }: CodeProps) =>
                inline ? (
                  <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4, fontSize: 14, color: "#d32f2f", border: "1px solid #e0e0e0" }} {...props} />
                ) : (
                  <code style={{ display: "block", background: "#f5f5f5", padding: 12, borderRadius: 6, overflow: "auto", color: "#333", border: "1px solid #e0e0e0" }} {...props} />
                ),
            }}
          >
            {answer}
          </ReactMarkdown>
        </div>
      )}
    </main>
  );
}
