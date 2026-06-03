import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

import { narrateOutletExplanation, getOutletPage } from "@/lib/api/outlet-data.functions";
import type { Outlet } from "@/lib/outlets-data";
import { formatNumber } from "@/lib/formatters";

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
  outlet?: Outlet;
};

function XaiChat() {
  const [outletId, setOutletId] = useState("");
  const [question, setQuestion] = useState("Explain this outlet score in business terms.");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const mutation = useMutation({
    mutationFn: async () => {
      const page = await getOutletPage({ query: outletId.trim(), limit: 1 });
      if (!page.rows || page.rows.length === 0) {
        throw new Error("No matching outlet found.");
      }
      const matchedOutlet = page.rows[0];

      const narration = await narrateOutletExplanation({
        outletId: matchedOutlet.outlet_id,
        question: question.trim(),
      });
      return { narrative: narration.narrative, outlet: matchedOutlet };
    },
    onSuccess: (data) => {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.narrative, outlet: data.outlet },
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
            
            <h1 className="mt-2 text-2xl font-semibold" style={{ fontFamily: "Syne" }}>
              Outlet XAI Chat
            </h1>
          </div>
          <div
            className="rounded-full border px-3 py-1 text-m font-mono"
            style={{ color: "#FFFF", borderColor: "#FFFF" }}
          >
            Model-driven explanations
          </div>
        </div>
        <p className="mt-3 text-s" style={{ color: "rgba(255,255,255,0.6)" }}>
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
          {/* <div className="text-xs" style={{ color: "#85756e" }}>
            Tip: Ask about key drivers, constraints, or local conditions.
          </div> */}
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
            {messages.map((message, index) => {
              const showChart = message.role === "assistant" && message.outlet?.xai_explanation;
              const chartData = showChart ? [
                { name: 'Base Value', value: message.outlet!.xai_explanation!.base_value, fill: '#85756e' },
                { name: 'Predicted', value: message.outlet!.xai_explanation!.predicted_raw, fill: '#91c499' },
                { name: 'Max Capacity', value: message.outlet!.xai_explanation!.maximum_monthly_liters, fill: '#1f487e' },
              ] : [];

              const driversData = showChart ? [
                ...message.outlet!.xai_explanation!.top_positive_drivers.map(d => ({ name: d.feature.replace(/_/g, ' '), contribution: d.contribution, fill: '#91c499' })),
                ...message.outlet!.xai_explanation!.top_negative_drivers.map(d => ({ name: d.feature.replace(/_/g, ' '), contribution: d.contribution, fill: '#e07a5f' }))
              ].sort((a, b) => b.contribution - a.contribution) : [];

              return (
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
                    {message.role === "user" ? "You" : `XAI Assistant • ${message.outlet ? message.outlet.outlet_id : ''}`}
                  </div>
                  <div className="mt-2">
                    {message.role === "assistant" ? (
                      <ReactMarkdown
                        components={{
                          ul: ({ node, ...props }) => <ul className="list-disc pl-5 mt-2 mb-2 space-y-1" {...props} />,
                          strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
                          p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      <div className="whitespace-pre-line">{message.content}</div>
                    )}
                  </div>
                  {showChart && (
                    <div className="mt-6 pt-4 border-t" style={{ borderColor: "rgba(134,187,189,0.3)" }}>
                      <h4 className="text-[11px] uppercase tracking-wider font-semibold mb-4" style={{ color: "#85756e" }}>Explanation Visuals</h4>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        
                        <div className="bg-white/5 border border-white/10 rounded p-4">
                           <h5 className="text-[10px] uppercase font-semibold mb-2 opacity-70">Volume Potential</h5>
                           <div className="h-40 w-full">
                             <ResponsiveContainer width="100%" height="100%">
                               <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                 <XAxis type="number" hide />
                                 <YAxis dataKey="name" type="category" width={80} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#141204' }} />
                                 <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#fff', borderRadius: '6px', color: '#141204', fontSize: '12px' }} formatter={(value: number) => formatNumber(value)} />
                                 <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                   {chartData.map((entry, idx) => (
                                     <Cell key={`cell-${idx}`} fill={entry.fill} />
                                   ))}
                                 </Bar>
                               </BarChart>
                             </ResponsiveContainer>
                           </div>
                        </div>

                        {driversData.length > 0 && (
                          <div className="bg-white/5 border border-white/10 rounded p-4">
                             <h5 className="text-[10px] uppercase font-semibold mb-2 opacity-70">Key Score Drivers</h5>
                             <div className="h-40 w-full">
                               <ResponsiveContainer width="100%" height="100%">
                                 <BarChart data={driversData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                   <XAxis type="number" hide />
                                   <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#141204' }} />
                                   <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#fff', borderRadius: '6px', color: '#141204', fontSize: '11px' }} formatter={(value: number) => formatNumber(value)} />
                                   <Bar dataKey="contribution" radius={[2, 2, 2, 2]}>
                                     {driversData.map((entry, idx) => (
                                       <Cell key={`cell-${idx}`} fill={entry.fill} />
                                     ))}
                                   </Bar>
                                 </BarChart>
                               </ResponsiveContainer>
                             </div>
                          </div>
                        )}
                        
                        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded p-4">
                            <h5 className="text-[10px] uppercase font-semibold mb-3 opacity-70">Local Signals & Constraints</h5>
                            <div className="flex flex-wrap gap-2">
                               {message.outlet!.xai_explanation!.local_environment_signals.map(s => (
                                  <div key={s.feature} className="px-2 py-1 rounded-sm text-[11px] font-medium" style={{ backgroundColor: 'rgba(31,72,126,0.1)', color: '#1f487e', border: '1px solid rgba(31,72,126,0.2)' }}>
                                    {s.feature.replace(/_/g, ' ')}: {s.value}
                                  </div>
                               ))}
                               {message.outlet!.xai_explanation!.operational_constraints.cooler_count != null && (
                                  <div className="px-2 py-1 rounded-sm text-[11px] font-medium" style={{ backgroundColor: 'rgba(133,117,110,0.1)', color: '#85756e', border: '1px solid rgba(133,117,110,0.2)' }}>
                                    Coolers: {message.outlet!.xai_explanation!.operational_constraints.cooler_count}
                                  </div>
                               )}
                               {message.outlet!.xai_explanation!.operational_constraints.historical_max_volume != null && (
                                  <div className="px-2 py-1 rounded-sm text-[11px] font-medium" style={{ backgroundColor: 'rgba(133,117,110,0.1)', color: '#85756e', border: '1px solid rgba(133,117,110,0.2)' }}>
                                    Hist. Max: {formatNumber(message.outlet!.xai_explanation!.operational_constraints.historical_max_volume)}L
                                  </div>
                               )}
                            </div>
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
