import { useState, useRef } from 'react';
import { importWords } from '../utils/db';

const convertTool = {
  name: "convert_vocabulary",
  description: "Convert pinyin vocabulary entries to Chinese characters",
  input_schema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            chinese: { type: "string", description: "Simplified Chinese characters" },
            pinyin: { type: "string", description: "Corrected pinyin with tone marks" },
            english: { type: "string", description: "English meaning" },
            type: { type: "string", enum: ["word", "phrase", "sentence", "grammar"] }
          },
          required: ["chinese", "pinyin", "english", "type"]
        }
      }
    },
    required: ["entries"]
  }
};

const typeBadgeColors = {
  word: 'bg-green-500/20 text-green-400',
  phrase: 'bg-blue-500/20 text-blue-400',
  sentence: 'bg-yellow-500/20 text-yellow-400',
  grammar: 'bg-slate-500/20 text-slate-400',
};

function hasChinese(str) {
  return /[\u4e00-\u9fff]/.test(str);
}

export default function VocabImport({ onImported }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('new');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [needsConversion, setNeedsConversion] = useState(false);
  const [convertedEntries, setConvertedEntries] = useState(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState(null);
  const fileRef = useRef(null);

  function parseLines(input) {
    const lines = input
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    let threeField = 0;
    let twoField = 0;
    const parsed = [];

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 3 && hasChinese(parts[0])) {
        threeField++;
        parsed.push({ word: parts[0], pinyin: parts[1], english: parts[2], _fields: 3 });
      } else if (parts.length >= 2) {
        twoField++;
        parsed.push({ pinyin: parts[0], english: parts[1], _fields: 2 });
      }
    }

    const mode = twoField > threeField ? 'two' : 'three';
    return { parsed, mode };
  }

  function detectFormat(input) {
    if (!input.trim()) {
      setNeedsConversion(false);
      return;
    }
    const { mode } = parseLines(input);
    setNeedsConversion(mode === 'two');
  }

  async function convertWithAI() {
    const { parsed } = parseLines(text);
    const twoFieldEntries = parsed.filter(e => e._fields === 2);
    if (twoFieldEntries.length === 0) return;

    setConverting(true);
    setConvertError(null);

    const numberedList = twoFieldEntries
      .map((e, i) => `${i + 1}. ${e.pinyin}, ${e.english}`)
      .join('\n');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: `You are a Chinese language expert. Convert the following pinyin+english vocabulary entries to Chinese characters using the convert_vocabulary tool.

Rules:
- Convert pinyin to simplified Chinese characters
- Fix pinyin tone marks if inconsistent (use proper tone marks like ā á ǎ à)
- Classify each entry: "word" (single word), "phrase" (multi-word expression), "sentence" (full sentence), "grammar" (grammar pattern/note)
- Deduplicate entries (keep first occurrence)
- Skip lines that are clearly malformed or incomplete
- Keep all valid entries even if they are sentences or grammar notes`,
          messages: [{ role: 'user', content: `Convert these vocabulary entries:\n\n${numberedList}` }],
          tools: [convertTool],
          maxTokens: 16384,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Conversion failed (${res.status})`);
      }
      const data = await res.json();

      const rawEntries = data.content?.entries;
      if (!rawEntries || rawEntries.length === 0) {
        throw new Error('No entries returned — try pasting fewer words');
      }

      const entries = rawEntries.map(e => ({
        ...e,
        selected: e.type === 'word' || e.type === 'phrase',
      }));

      setConvertedEntries(entries);
    } catch (err) {
      setConvertError(err.message || 'Conversion failed');
    } finally {
      setConverting(false);
    }
  }

  function toggleEntry(index) {
    setConvertedEntries(prev =>
      prev.map((e, i) => i === index ? { ...e, selected: !e.selected } : e)
    );
  }

  function selectAll(selected) {
    setConvertedEntries(prev => prev.map(e => ({ ...e, selected })));
  }

  async function handleImportConverted() {
    const selected = convertedEntries.filter(e => e.selected);
    if (selected.length === 0) return;

    setImporting(true);
    setResult(null);
    const words = selected.map(e => ({ word: e.chinese, pinyin: e.pinyin, english: e.english }));
    const count = await importWords(words, status);
    setImporting(false);
    setResult(`Imported ${count} word${count !== 1 ? 's' : ''}`);
    setConvertedEntries(null);
    setText('');
    setNeedsConversion(false);
    onImported?.();
  }

  async function handleImport() {
    const { parsed } = parseLines(text);
    const threeFieldEntries = parsed.filter(e => e._fields === 3);
    if (threeFieldEntries.length === 0) return;

    setImporting(true);
    setResult(null);
    const count = await importWords(threeFieldEntries, status);
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
      const content = ev.target.result;
      setText(content);
      detectFormat(content);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  // Preview state: show converted entries for review
  if (convertedEntries) {
    const selectedCount = convertedEntries.filter(e => e.selected).length;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">
            Review Converted Entries
          </h3>
          <span className="text-xs text-slate-400">
            {selectedCount} of {convertedEntries.length} selected
          </span>
        </div>

        <div className="flex gap-2 text-xs">
          <button onClick={() => selectAll(true)} className="text-teal-400 hover:text-teal-300 cursor-pointer">Select all</button>
          <span className="text-slate-600">|</span>
          <button onClick={() => selectAll(false)} className="text-teal-400 hover:text-teal-300 cursor-pointer">Deselect all</button>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
          {convertedEntries.map((entry, i) => (
            <label
              key={i}
              className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                entry.selected ? 'bg-slate-700/60' : 'bg-slate-800/40 opacity-60'
              }`}
            >
              <input
                type="checkbox"
                checked={entry.selected}
                onChange={() => toggleEntry(i)}
                className="accent-teal-500 mt-1 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-slate-50 text-sm font-medium">{entry.chinese}</span>
                  <span className="text-slate-400 text-xs">{entry.pinyin}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${typeBadgeColors[entry.type] || typeBadgeColors.word}`}>
                    {entry.type}
                  </span>
                </div>
                <div className="text-slate-400 text-xs truncate">{entry.english}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="vocab-status-preview" checked={status === 'known'} onChange={() => setStatus('known')} className="accent-teal-500" />
              <span className="text-sm text-slate-300">I know these</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="vocab-status-preview" checked={status === 'new'} onChange={() => setStatus('new')} className="accent-teal-500" />
              <span className="text-sm text-slate-300">I need to learn these</span>
            </label>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setConvertedEntries(null); setConvertError(null); }}
            className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-lg py-2.5 transition-colors cursor-pointer"
          >
            Back
          </button>
          <button
            onClick={handleImportConverted}
            disabled={selectedCount === 0 || importing}
            className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors cursor-pointer"
          >
            {importing ? 'Importing...' : `Import Selected (${selectedCount})`}
          </button>
        </div>

        {result && (
          <p className="text-green-400 text-sm text-center">{result}</p>
        )}
      </div>
    );
  }

  // Paste state: textarea + buttons
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-slate-400">
            {needsConversion
              ? 'Paste words (pinyin, english — AI will add Chinese)'
              : 'Paste words (one per line: word, pinyin, english)'}
          </label>
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
          onChange={e => {
            setText(e.target.value);
            detectFormat(e.target.value);
            setResult(null);
            setConvertError(null);
          }}
          placeholder={"你好, nǐ hǎo, hello\n谢谢, xiè xiè, thank you\n\nor just:\nnǐ hǎo, hello\nxiè xiè, thank you"}
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

      {needsConversion ? (
        <button
          onClick={convertWithAI}
          disabled={!text.trim() || converting}
          className="w-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors cursor-pointer"
        >
          {converting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Converting with AI...
            </span>
          ) : 'Convert with AI'}
        </button>
      ) : (
        <button
          onClick={handleImport}
          disabled={!text.trim() || importing}
          className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors cursor-pointer"
        >
          {importing ? 'Importing...' : 'Import'}
        </button>
      )}

      {convertError && (
        <p className="text-red-400 text-sm text-center">{convertError}</p>
      )}
      {result && (
        <p className="text-green-400 text-sm text-center">{result}</p>
      )}
    </div>
  );
}
