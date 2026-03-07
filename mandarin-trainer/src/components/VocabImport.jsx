import { useState, useRef } from 'react';
import { importWords } from '../utils/db';

export default function VocabImport({ onImported }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('new');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  function parseLines(input) {
    return input
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 3) {
          return { word: parts[0], pinyin: parts[1], english: parts[2] };
        }
        return null;
      })
      .filter(Boolean);
  }

  async function handleImport() {
    const words = parseLines(text);
    if (words.length === 0) return;

    setImporting(true);
    setResult(null);
    const count = await importWords(words, status);
    setImporting(false);
    setResult(`Imported ${count} word${count !== 1 ? 's' : ''}`);
    setText('');
    onImported?.();
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setText(ev.target.result);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-slate-400">Paste words (one per line: word, pinyin, english)</label>
          <label className="text-xs text-teal-400 hover:text-teal-300 cursor-pointer">
            Upload CSV
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"你好, nǐ hǎo, hello\n谢谢, xiè xiè, thank you\n再见, zài jiàn, goodbye"}
          rows={5}
          className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-500 text-sm resize-none"
        />
      </div>

      <div className="flex gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="vocab-status"
            checked={status === 'known'}
            onChange={() => setStatus('known')}
            className="accent-teal-500"
          />
          <span className="text-sm text-slate-300">I know these</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="vocab-status"
            checked={status === 'new'}
            onChange={() => setStatus('new')}
            className="accent-teal-500"
          />
          <span className="text-sm text-slate-300">I need to learn these</span>
        </label>
      </div>

      <button
        onClick={handleImport}
        disabled={!text.trim() || importing}
        className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors cursor-pointer"
      >
        {importing ? 'Importing...' : 'Import'}
      </button>

      {result && (
        <p className="text-green-400 text-sm text-center">{result}</p>
      )}
    </div>
  );
}
