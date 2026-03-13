import { useState } from 'react';
import VocabImport from './VocabImport';
import VocabList from './VocabList';

export default function VocabScreen({ onBack }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-dvh bg-warm-50 p-6">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-warm-900">📚 Vocabulary</h1>
          <button
            onClick={onBack}
            className="text-warm-600 hover:text-warm-900 text-sm cursor-pointer"
          >
            ← Back
          </button>
        </div>

        <VocabImport onImported={() => setRefreshKey(k => k + 1)} />
        <VocabList refreshTrigger={refreshKey} />
      </div>
    </div>
  );
}
