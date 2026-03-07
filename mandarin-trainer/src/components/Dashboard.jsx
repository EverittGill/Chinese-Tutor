import { useState, useEffect } from 'react';
import { getVocabulary, getRecentSessions, getPronunciationTrend, getMistakePatterns } from '../utils/db';
import useAzureTTS from '../hooks/useAzureTTS';

function PronunciationChart({ data }) {
  if (data.length < 1) {
    return <p className="text-slate-500 text-sm text-center py-4">No pronunciation data yet</p>;
  }

  const width = 300;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 25, left: 35 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minScore = Math.min(...data.map(d => d.avg_accuracy));
  const maxScore = Math.max(...data.map(d => d.avg_accuracy));
  const yMin = Math.max(0, minScore - 10);
  const yMax = Math.min(100, maxScore + 10);

  const points = data.map((d, i) => {
    const x = padding.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
    const y = padding.top + chartH - ((d.avg_accuracy - yMin) / (yMax - yMin || 1)) * chartH;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {/* Y axis labels */}
      <text x={padding.left - 5} y={padding.top + 4} textAnchor="end" className="fill-slate-500 text-[8px]">{yMax}</text>
      <text x={padding.left - 5} y={padding.top + chartH + 4} textAnchor="end" className="fill-slate-500 text-[8px]">{yMin}</text>

      {/* Grid lines */}
      <line x1={padding.left} y1={padding.top} x2={padding.left + chartW} y2={padding.top} stroke="#334155" strokeWidth="0.5" />
      <line x1={padding.left} y1={padding.top + chartH} x2={padding.left + chartW} y2={padding.top + chartH} stroke="#334155" strokeWidth="0.5" />

      {/* Line */}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#14b8a6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {data.map((d, i) => {
        const [x, y] = points[i].split(',').map(Number);
        return <circle key={i} cx={x} cy={y} r="3" fill="#14b8a6" />;
      })}

      {/* X axis labels (first and last dates) */}
      {data.length > 0 && (
        <>
          <text x={padding.left} y={height - 5} textAnchor="start" className="fill-slate-500 text-[7px]">
            {new Date(data[0].started_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          </text>
          {data.length > 1 && (
            <text x={padding.left + chartW} y={height - 5} textAnchor="end" className="fill-slate-500 text-[7px]">
              {new Date(data[data.length - 1].started_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

export default function Dashboard({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [vocabCounts, setVocabCounts] = useState({ known: 0, learning: 0, new: 0 });
  const [sessions, setSessions] = useState([]);
  const [trend, setTrend] = useState([]);
  const [mistakes, setMistakes] = useState([]);
  const [latestSummary, setLatestSummary] = useState(null);
  const { speak, isSpeaking } = useAzureTTS();

  useEffect(() => {
    async function load() {
      const [known, learning, newW, recentSessions, pronTrend, mistakePatterns] = await Promise.all([
        getVocabulary('known'),
        getVocabulary('learning'),
        getVocabulary('new'),
        getRecentSessions(10),
        getPronunciationTrend(30),
        getMistakePatterns(5)
      ]);

      setVocabCounts({ known: known.length, learning: learning.length, new: newW.length });
      setSessions(recentSessions);
      setTrend(pronTrend);
      setMistakes(mistakePatterns);

      // Get latest session with summary
      const withSummary = recentSessions.find(s => s.summary_json);
      if (withSummary) setLatestSummary(withSummary.summary_json);

      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-900 p-6 overflow-y-auto">
      <div className="max-w-md mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-50">📊 Progress</h1>
          <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer">← Back</button>
        </div>

        {/* Vocabulary counts */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Known', count: vocabCounts.known, color: 'text-green-400' },
            { label: 'Learning', count: vocabCounts.learning, color: 'text-yellow-400' },
            { label: 'New', count: vocabCounts.new, color: 'text-blue-400' },
          ].map(item => (
            <div key={item.label} className="bg-slate-800 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
              <p className="text-xs text-slate-400">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Pronunciation trend */}
        <div className="bg-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Pronunciation Trend (30 days)</h3>
          <PronunciationChart data={trend} />
        </div>

        {/* Recent sessions */}
        <div className="bg-slate-800 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-slate-400 mb-2">Recent Sessions</h3>
          {sessions.length === 0 ? (
            <p className="text-slate-500 text-sm">No sessions yet</p>
          ) : (
            sessions.map(session => (
              <div key={session.id} className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">{session.topic || 'Open'}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(session.started_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    {' · '}{session.exchange_count || 0} turns
                  </p>
                </div>
                {session.avg_accuracy != null && (
                  <span className={`text-sm font-medium ${session.avg_accuracy >= 80 ? 'text-green-400' : session.avg_accuracy >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {Math.round(session.avg_accuracy)}%
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Common mistakes */}
        {mistakes.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Common Mistakes</h3>
            {mistakes.map(m => (
              <div key={m.id} className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <p className="text-sm text-slate-300">{m.description}</p>
                  <span className="text-xs text-slate-500 ml-2 shrink-0">×{m.occurrence_count}</span>
                </div>
                {m.example_original && (
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="text-red-400">{m.example_original}</span>
                    {' → '}
                    <span className="text-green-400">{m.example_corrected}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Latest practice sentences */}
        {latestSummary?.practice_sentences?.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Practice Sentences</h3>
            {latestSummary.practice_sentences.map((s, i) => (
              <div key={i} className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <p className="text-slate-50">{s.chinese}</p>
                  <button
                    onClick={() => speak(s.chinese)}
                    disabled={isSpeaking}
                    className="text-slate-400 hover:text-teal-400 ml-2 shrink-0 cursor-pointer"
                  >
                    🔊
                  </button>
                </div>
                <p className="text-xs text-teal-400">{s.pinyin}</p>
                <p className="text-xs text-slate-400">{s.english}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
