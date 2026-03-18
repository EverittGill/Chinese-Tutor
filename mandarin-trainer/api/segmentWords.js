/**
 * segmentWords.js — Chinese text segmentation, pinyin, and dictionary lookup.
 *
 * This module is the deterministic backbone of word-by-word translation.
 * It provides two main exports:
 *
 *   segmentAndAnnotate(text) → [{chinese, pinyin, english}, ...]
 *     Splits Chinese text into words using Intl.Segmenter (ICU-based, built into Node),
 *     then annotates each word with CEDICT pinyin and English definitions.
 *     Words not found in CEDICT are sub-segmented via forward maximum matching.
 *
 *   generatePinyin(text) → "nǐ hǎo，wǒ shì..."
 *     Produces sentence-level pinyin with spaces between words (not syllables).
 *
 * Pinyin source priority:
 *   1. CEDICT numbered pinyin → converted to tone marks (handles erhua correctly: nǎr not nǎěr)
 *   2. pinyin-pro library fallback (for words not in CEDICT)
 *
 * CEDICT entry selection:
 *   - Scored to prefer common words over proper nouns/surnames
 *   - Single-character particles get a large bonus for neutral tone (tone 5)
 *     so 了→le, 吗→ma, 的→de instead of liǎo, má, dí
 *
 * This module is used by translateWords.js, which adds Haiku contextual translations
 * on top of the CEDICT definitions produced here.
 */
import { pinyin } from 'pinyin-pro';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// --- Numbered pinyin → tone mark conversion ---

const toneMarks = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

function numberedSyllableToToned(syllable) {
  if (syllable === 'r5' || syllable === 'r0') return 'r';

  const toneMatch = syllable.match(/([1-5])$/);
  if (!toneMatch) return syllable;

  const tone = parseInt(toneMatch[1]);
  let base = syllable.slice(0, -1).toLowerCase();
  base = base.replace(/u:/g, 'ü').replace(/v/g, 'ü');

  if (tone === 5 || tone === 0) return base;

  const toneIdx = tone - 1;
  const vowels = 'aeiouü';

  if (base.includes('a')) return base.replace('a', toneMarks.a[toneIdx]);
  if (base.includes('e')) return base.replace('e', toneMarks.e[toneIdx]);
  if (base.includes('ou')) return base.replace('o', toneMarks.o[toneIdx]);

  for (let i = base.length - 1; i >= 0; i--) {
    const ch = base[i];
    if (vowels.includes(ch) && toneMarks[ch]) {
      return base.slice(0, i) + toneMarks[ch][toneIdx] + base.slice(i + 1);
    }
  }

  return base;
}

function numberedPinyinToToned(numberedPinyin) {
  return numberedPinyin
    .split(/\s+/)
    .map(s => numberedSyllableToToned(s.trim()))
    .filter(Boolean)
    .join('');
}

// --- Parse CC-CEDICT ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const dictContents = readFileSync(join(__dirname, 'cedict.txt'), 'utf-8');
const cedictMap = new Map();

function isSurnameOrProperNoun(pinyinRaw) {
  return /^[A-Z]/.test(pinyinRaw.trim());
}

function entryScore(english, pinyinRaw, isProper, simplified) {
  if (isProper) return 0;
  const defCount = english.split('/').length;
  let score = defCount * 100 + english.length;
  // Strongly prefer neutral tone (tone 5) for single chars — grammatical particles
  if ([...simplified].length === 1 && /5\]?$/.test(pinyinRaw.trim())) {
    score += 10000;
  }
  return score;
}

for (const line of dictContents.split('\n')) {
  if (line.startsWith('#') || !line.trim()) continue;
  const match = line.match(/^(\S+)\s(\S+)\s\[([^\]]+)\]\s\/(.+)\//);
  if (match) {
    const simplified = match[2];
    const pinyinRaw = match[3];
    const english = match[4];
    const isProper = isSurnameOrProperNoun(pinyinRaw);
    const score = entryScore(english, pinyinRaw, isProper, simplified);

    const existing = cedictMap.get(simplified);
    if (!existing || score > existing.score) {
      cedictMap.set(simplified, {
        english,
        pinyin: numberedPinyinToToned(pinyinRaw),
        isProper,
        score,
      });
    }
  }
}

// Clean CEDICT definition text for display
function cleanDefinition(english) {
  return english
    .replace(/CL:[^\s/;]*/g, '')
    .replace(/\[[a-züA-Z0-9: ]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// --- Intl.Segmenter for primary word segmentation ---

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

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

function isChinese(ch) {
  const code = ch.codePointAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0xF900 && code <= 0xFAFF);
}

// --- Sub-segmentation: decompose a segment not found in CEDICT ---
// Uses forward maximum matching against CEDICT to break it into known words.

function subSegment(text) {
  const chars = [...text];
  const result = [];
  let i = 0;

  while (i < chars.length) {
    let matched = false;
    const remaining = chars.length - i;
    const tryLen = Math.min(6, remaining);

    for (let len = tryLen; len >= 2; len--) {
      const candidate = chars.slice(i, i + len).join('');
      if (cedictMap.has(candidate)) {
        result.push(candidate);
        i += len;
        matched = true;
        break;
      }
    }

    if (!matched) {
      result.push(chars[i]);
      i++;
    }
  }

  return result;
}

// Build a word annotation object from a Chinese string
function annotateWord(chinese) {
  const entry = cedictMap.get(chinese);
  if (entry) {
    return {
      chinese,
      pinyin: entry.pinyin,
      english: cleanDefinition(entry.english.split('/').slice(0, 5).join('; ')),
    };
  }
  // Fallback: pinyin-pro + char-by-char english
  const py = pinyin(chinese, { toneType: 'symbol', type: 'array' }).join('');
  const charDefs = [...chinese]
    .map(ch => {
      const e = cedictMap.get(ch);
      return e ? e.english.split('/')[0].split(';')[0].trim() : null;
    })
    .filter(Boolean);
  return {
    chinese,
    pinyin: py,
    english: charDefs.length > 0 ? charDefs.join(' + ') : '',
  };
}

/**
 * Segment Chinese text into words with pinyin and English definitions.
 * Uses Intl.Segmenter for primary segmentation (good word boundaries),
 * with CEDICT-based sub-segmentation when a word isn't found.
 * Always uses CEDICT pinyin (correct erhua/tone handling) when available.
 */
export function segmentAndAnnotate(chineseText) {
  if (!chineseText) return [];

  const segments = segmenter.segment(chineseText);
  const result = [];

  for (const { segment } of segments) {
    if (/^\s+$/.test(segment)) continue;

    // Punctuation: merge into preceding word's chinese display text
    if (isPunctuation(segment)) {
      if (result.length > 0) {
        result[result.length - 1].chinese += segment;
      }
      continue;
    }

    // Check if the whole segment is in CEDICT
    if (cedictMap.has(segment)) {
      result.push(annotateWord(segment));
      continue;
    }

    // Not in CEDICT: sub-segment into known words
    const hasChinese = [...segment].some(isChinese);
    if (hasChinese) {
      const subWords = subSegment(segment);
      for (const sw of subWords) {
        result.push(annotateWord(sw));
      }
    } else {
      // Pure non-Chinese (English name, number, etc.)
      result.push({ chinese: segment, pinyin: segment, english: '' });
    }
  }

  return result;
}

/**
 * Generate sentence-level pinyin for Chinese text.
 */
export function generatePinyin(chineseText) {
  if (!chineseText) return '';
  const words = [];
  for (const { segment } of segmenter.segment(chineseText)) {
    if (/^\s+$/.test(segment)) continue;
    if (isPunctuation(segment)) {
      words.push(segment);
    } else {
      const entry = cedictMap.get(segment);
      if (entry) {
        words.push(entry.pinyin);
      } else {
        // Sub-segment and get pinyin for each part
        const hasChinese = [...segment].some(isChinese);
        if (hasChinese) {
          const subWords = subSegment(segment);
          words.push(subWords.map(sw => {
            const e = cedictMap.get(sw);
            return e ? e.pinyin : pinyin(sw, { toneType: 'symbol', type: 'array' }).join('');
          }).join(''));
        } else {
          words.push(segment);
        }
      }
    }
  }
  return words.join(' ');
}
