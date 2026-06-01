import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { narrateOutletExplanation } from "@/lib/api/outlet-data.functions";

export const Route = createFileRoute("/xai")({
  head: () => ({
    meta: [
      { title: "XAI Chat · Outlet Intelligence" },
      { name: "description", content: "Explain outlet scores in business terms." },
    ],
  }),
  component: XaiChat,
});

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function XaiChat() {
  const [outletId, setOutletId] = useState("");
  const [question, setQuestion] = useState("Explain this outlet score in business terms.");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const mutation = useMutation({
    mutationFn: async () => {
      return narrateOutletExplanation({
        outletId: outletId.trim(),
        question: question.trim(),
      });
    },
    onSuccess: (data) => {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.narrative },
      ]);
    },
    onError: (error: Error) => {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Sorry, I could not generate an explanation. ${error.message}`,
        },
      ]);
    },
  });

  const canSend = outletId.trim().length > 0 && question.trim().length > 0 && !mutation.isPending;

  const prompt = useMemo(
    () =>
      messages.length === 0
        ? "Ask about any outlet and I will summarize the key drivers behind its score."
        : "",
    [messages.length],
  );

  const handleSend = () => {
    if (!canSend) return;
    setMessages((current) => [
      ...current,
      { role: "user", content: `Outlet ${outletId.trim()}: ${question.trim()}` },
    ]);
    mutation.mutate();
  };

  return (
    <main className="fade-in mx-auto max-w-screen-2xl px-6 py-8">
      <section className="rounded-lg p-6" style={{ backgroundColor: "#141204", color: "#ffffff" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <div
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "rgba(134,187,189,0.7)" }}
            >
              Dynamic Explainability
            </div>
            <h1 className="mt-2 text-2xl font-semibold" style={{ fontFamily: "Syne" }}>
              Outlet XAI Chat
            </h1>
          </div>
          <div
            className="rounded-full border px-3 py-1 text-xs font-mono"
            style={{ color: "rgba(134,187,189,0.7)", borderColor: "rgba(134,187,189,0.3)" }}
          >
            Model-driven explanations
          </div>
        </div>
        <p className="mt-3 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
          Provide an outlet ID and we will translate the model drivers into a business narrative.
        </p>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="card-surface p-5 space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: "#85756e" }}>
              Outlet lookup
            </div>
            <input
              value={outletId}
              onChange={(event) => setOutletId(event.target.value)}
              placeholder="OUT_00001"
              className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-sm font-mono"
              style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
            />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: "#85756e" }}>
              Question
            </div>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-sm"
              style={{ borderColor: "rgba(20,18,4,0.12)", color: "#141204" }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full rounded-md px-3 py-2 text-sm font-semibold transition-colors"
            style={{
              backgroundColor: canSend ? "#1f487e" : "rgba(31,72,126,0.3)",
              color: "#ffffff",
            }}
          >
            {mutation.isPending ? "Generating..." : "Generate explanation"}
          </button>
          <div className="text-xs" style={{ color: "#85756e" }}>
            Tip: Ask about key drivers, constraints, or local conditions.
          </div>
        </div>

        <div className="card-surface p-5">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "#85756e" }}>
            Conversation
          </div>
          <div className="mt-4 space-y-4">
            {prompt && (
              <div
                className="rounded-md px-4 py-3 text-sm"
                style={{ backgroundColor: "rgba(20,18,4,0.04)", color: "#85756e" }}
              >
                {prompt}
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className="rounded-md px-4 py-3 text-sm leading-relaxed"
                style={{
                  backgroundColor:
                    message.role === "user" ? "rgba(31,72,126,0.08)" : "rgba(134,187,189,0.16)",
                  color: "#141204",
                  borderLeft:
                    message.role === "user"
                      ? "3px solid rgba(31,72,126,0.6)"
                      : "3px solid rgba(134,187,189,0.7)",
                }}
              >
                <div className="text-[11px] uppercase tracking-wider" style={{ color: "#85756e" }}>
                  {message.role === "user" ? "You" : "XAI Assistant"}
                </div>
                <div className="mt-2 whitespace-pre-line">{message.content}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
