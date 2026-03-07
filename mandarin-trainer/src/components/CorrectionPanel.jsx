import { useEffect, useRef } from 'react';

const TYPE_LABELS = {
  grammar: { label: '语法 Grammar', color: 'text-yellow-500' },
  vocabulary: { label: '词汇 Vocabulary', color: 'text-blue-400' },
  pronunciation: { label: '发音 Pronunciation', color: 'text-red-400' },
};

function CorrectionItem({ correction }) {
  const typeInfo = TYPE_LABELS[correction.type] || TYPE_LABELS.grammar;
  return (
    <div className="bg-slate-700/50 rounded-lg p-3 space-y-1">
      <span className={`text-xs font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-red-300 line-through">{correction.original}</span>
        <span className="text-slate-500">→</span>
        <span className="text-green-400">{correction.corrected}</span>
      </div>
      {correction.pinyin && (
        <p className="text-xs text-teal-400">{correction.pinyin}</p>
      )}
      <p className="text-xs text-slate-400">{correction.explanation}</p>
    </div>
  );
}

function VocabItem({ vocab }) {
  return (
    <div className="bg-slate-700/50 rounded-lg p-3 space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-lg text-slate-50">{vocab.word}</span>
        <span className="text-sm text-teal-400">{vocab.pinyin}</span>
      </div>
      <p className="text-sm text-slate-300">{vocab.english}</p>
      {vocab.context && (
        <p className="text-xs text-slate-400">{vocab.context}</p>
      )}
    </div>
  );
}

export default function CorrectionPanel({ corrections = [], newVocabulary = [], onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const hasContent = corrections.length > 0 || newVocabulary.length > 0;
  if (!hasContent) return null;

  // Group corrections by type
  const grouped = {};
  corrections.forEach(c => {
    if (!grouped[c.type]) grouped[c.type] = [];
    grouped[c.type].push(c);
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div
        ref={panelRef}
        className="bg-slate-800 rounded-t-2xl w-full max-h-[70vh] overflow-y-auto p-6 space-y-4 animate-slide-up"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-50">Corrections & Vocabulary</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xl cursor-pointer"
          >
            ✕
          </button>
        </div>

        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="space-y-2">
            {items.map((c, i) => <CorrectionItem key={i} correction={c} />)}
          </div>
        ))}

        {newVocabulary.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-teal-400">New Vocabulary</h4>
            {newVocabulary.map((v, i) => <VocabItem key={i} vocab={v} />)}
          </div>
        )}
      </div>
    </div>
  );
}
