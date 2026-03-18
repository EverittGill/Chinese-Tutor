import { pinyin } from 'pinyin-pro';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Parse CC-CEDICT into a Map<simplified, english> for lookups
const __dirname = dirname(fileURLToPath(import.meta.url));
const dictContents = readFileSync(join(__dirname, 'cedict.txt'), 'utf-8');
const cedictMap = new Map();
for (const line of dictContents.split('\n')) {
  if (line.startsWith('#') || !line.trim()) continue;
  const match = line.match(/^(\S+)\s(\S+)\s\[([^\]]+)\]\s\/(.+)\//);
  if (match) {
    const simplified = match[2];
    const english = match[4];
    // Keep first entry per simplified form (most common)
    if (!cedictMap.has(simplified)) {
      cedictMap.set(simplified, english);
    }
  }
}

// Use Intl.Segmenter for word segmentation (built-in Node 16+, uses ICU)
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

// Chinese + half-width punctuation that should be merged into the preceding word
const punctuationSet = new Set([
  '·', '×', '—', '\u2018', '\u2019', '\u201C', '\u201D', '\u2026',
  '、', '。', '《', '》', '『', '』', '【', '】',
  '！', '（', '）', '，', '：', '；', '？',
  '…', '～', '⋯',
  '!', '?', '.', ',', ':', ';', '(', ')'
]);

function isPunctuation(text) {
  return [...text].every(ch => punctuationSet.has(ch) || /\s/.test(ch));
}

/**
 * Segment Chinese text into words with pinyin and English definitions.
 * @param {string} chineseText - Chinese text to segment
 * @returns {{chinese: string, pinyin: string, english: string}[]}
 */
export function segmentAndAnnotate(chineseText) {
  if (!chineseText) return [];

  const segments = segmenter.segment(chineseText);
  const result = [];

  for (const { segment } of segments) {
    // Skip whitespace-only segments
    if (/^\s+$/.test(segment)) continue;

    // If punctuation, merge into preceding word
    if (isPunctuation(segment)) {
      if (result.length > 0) {
        result[result.length - 1].chinese += segment;
      }
      continue;
    }

    // Join syllables without spaces so multi-char words read as one unit (e.g. jīntiān not jīn tiān)
    const py = pinyin(segment, { toneType: 'symbol', type: 'array' }).join('');
    const dictEntry = cedictMap.get(segment);
    const english = dictEntry
      ? dictEntry.split('/').slice(0, 3).join('; ')
      : '';

    result.push({ chinese: segment, pinyin: py, english });
  }

  return result;
}

/**
 * Generate sentence-level pinyin for Chinese text.
 * @param {string} chineseText - Chinese text
 * @returns {string}
 */
export function generatePinyin(chineseText) {
  if (!chineseText) return '';
  // Segment into words first, then get pinyin per word (syllables joined),
  // so sentence pinyin has spaces between words but not within them
  const words = [];
  for (const { segment } of segmenter.segment(chineseText)) {
    if (/^\s+$/.test(segment)) continue;
    if (isPunctuation(segment)) {
      words.push(segment);
    } else {
      words.push(pinyin(segment, { toneType: 'symbol', type: 'array' }).join(''));
    }
  }
  return words.join(' ');
}
