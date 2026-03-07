import { useState, useEffect } from 'react';
import { getSummaryPrompt, summaryTool } from '../utils/summaryPrompt';
import useAzureTTS from '../hooks/useAzureTTS';

export default function SessionSummary({ exchanges, onDone }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { speak, isSpeaking } = useAzureTTS();

  useEffect(() => {
    async function fetchSummary() {
      try {
        const exchangeText = exchanges.map((ex, i) =>
          `Turn ${i + 1}:\nUser: ${ex.userText}${ex.pronunciationScore != null ? ` (pronunciation: ${ex.pronunciationScore}/100)` : ''}\nAI: ${JSON.stringify(ex.aiResponse)}`
        ).join('\n\n');

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `Here is the session data:\n\n${exchangeText}\n\nPlease generate a session summary.` }],
            systemPrompt: getSummaryPrompt(),
            maxTokens: 2048,
            tools: [summaryTool]
          })
        });

        if (!res.ok) throw new Error('Failed to generate summary');
        const data = await res.json();
        setSummary(data.content);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, [exchanges]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400">Generating session summary...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <button onClick={onDone} className="text-teal-400 hover:text-teal-300 cursor-pointer">
            Back to Topics
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-900 p-6 overflow-y-auto">
      <div className="max-w-md mx-auto space-y-6 pb-12">
        <h2 className="text-2xl font-bold text-slate-50 text-center">Session Summary</h2>

        {/* Overall assessment */}
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-slate-300">{summary.overall_assessment}</p>
          {summary.estimated_hsk_level && (
            <p className="text-teal-400 text-sm mt-2">Level: {summary.estimated_hsk_level}</p>
          )}
        </div>

        {/* Strengths */}
        {summary.did_well?.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-green-400 font-medium text-sm">What you did well</h3>
            <ul className="space-y-1">
              {summary.did_well.map((item, i) => (
                <li key={i} className="text-slate-300 text-sm">• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Areas to improve */}
        {summary.needs_work?.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-yellow-400 font-medium text-sm">Areas to improve</h3>
            <ul className="space-y-1">
              {summary.needs_work.map((item, i) => (
                <li key={i} className="text-slate-300 text-sm">• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Practice sentences */}
        {summary.practice_sentences?.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-teal-400 font-medium text-sm">Practice sentences</h3>
            {summary.practice_sentences.map((s, i) => (
              <div key={i} className="bg-slate-700/50 rounded-lg p-3 space-y-1">
                <div className="flex items-start justify-between">
                  <p className="text-slate-50 text-lg">{s.chinese}</p>
                  <button
                    onClick={() => speak(s.chinese)}
                    disabled={isSpeaking}
                    className="text-slate-400 hover:text-teal-400 ml-2 shrink-0 cursor-pointer"
                  >
                    🔊
                  </button>
                </div>
                <p className="text-teal-400 text-xs">{s.pinyin}</p>
                <p className="text-slate-400 text-xs">{s.english}</p>
                <p className="text-slate-500 text-xs italic">{s.focus}</p>
              </div>
            ))}
          </div>
        )}

        {/* Suggested topics */}
        {summary.suggested_topics?.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-slate-400 font-medium text-sm">Suggested next topics</h3>
            <ul className="space-y-1">
              {summary.suggested_topics.map((topic, i) => (
                <li key={i} className="text-slate-300 text-sm">• {topic}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={onDone}
          className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg py-3 transition-colors cursor-pointer"
        >
          Back to Topics
        </button>
      </div>
    </div>
  );
}
