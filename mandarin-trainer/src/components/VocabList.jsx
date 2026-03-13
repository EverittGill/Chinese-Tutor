import { useState, useEffect, useCallback } from 'react';
import { getVocabulary, updateWordStatus } from '../utils/db';

const TABS = [
  { key: 'known', label: 'Known' },
  { key: 'learning', label: 'Learning' },
  { key: 'new', label: 'New' },
];

export default function VocabList({ refreshTrigger }) {
  const [activeTab, setActiveTab] = useState('known');
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ known: 0, learning: 0, new: 0 });

  const fetchWords = useCallback(async () => {
    setLoading(true);
    const data = await getVocabulary(activeTab);
    setWords(data);
    setLoading(false);
  }, [activeTab]);

  const fetchCounts = useCallback(async () => {
    const [known, learning, newW] = await Promise.all([
      getVocabulary('known'),
      getVocabulary('learning'),
      getVocabulary('new'),
    ]);
    setCounts({ known: known.length, learning: learning.length, new: newW.length });
  }, []);

  useEffect(() => { fetchWords(); }, [fetchWords, refreshTrigger]);
  useEffect(() => { fetchCounts(); }, [fetchCounts, refreshTrigger]);

  async function handleToggleStatus(word) {
    const nextStatus = {
      known: 'learning',
      learning: 'known',
      new: 'learning',
    };
    await updateWordStatus(word.word, nextStatus[word.status]);
    fetchWords();
    fetchCounts();
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-warm-200/50 rounded-lg p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors cursor-pointer
              ${activeTab === tab.key ? 'bg-warm-100 text-warm-900 shadow-soft' : 'text-warm-600 hover:text-warm-700'}`}
          >
            {tab.label} ({counts[tab.key]})
          </button>
        ))}
      </div>

      {/* Word list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : words.length === 0 ? (
        <p className="text-warm-500 text-center py-8 text-sm">No words in this category yet</p>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {words.map(word => (
            <button
              key={word.id}
              onClick={() => handleToggleStatus(word)}
              className="w-full bg-warm-100 hover:bg-warm-200 rounded-lg p-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg text-warm-900">{word.word}</span>
                  <span className="text-sm text-brand-600">{word.pinyin}</span>
                </div>
                <div className="text-right">
                  {word.times_seen > 0 && (
                    <span className="text-xs text-warm-500">
                      seen {word.times_seen}x
                      {word.accuracy_avg > 0 && ` · ${word.accuracy_avg}%`}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-warm-600">{word.english}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
