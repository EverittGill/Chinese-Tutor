// Pure utility — generates actionable pronunciation feedback from Azure scores + pinyin
// No API calls, all logic is local.

const INITIAL_TIPS = {
  'zh': 'Curl your tongue back (retroflex), unaspirated',
  'ch': 'Curl your tongue back with aspiration',
  'sh': 'Curl your tongue back for retroflex "sh"',
  'r': 'Curl tongue back, voiced — like "r" but with tongue further back',
  'z': 'Tongue behind teeth, unaspirated "dz"',
  'c': 'Tongue behind teeth, aspirated "ts"',
  's': 'Tongue behind teeth, sharp "s"',
  'j': 'Press tongue against hard palate, unaspirated (not English "j")',
  'q': 'Press tongue against hard palate with aspiration',
  'x': 'Press tongue against hard palate for palatal "sh"',
  'ü': 'Round your lips like "u" but say "ee"',
  'iu': 'Starts with "ee", glides to "oh"',
  'ui': 'Starts with "oo-ay"',
  'un': 'Sounds like "wen"',
};

const TONE_DESCRIPTIONS = {
  1: 'high and flat — keep pitch steady and high',
  2: 'rising — start mid and go up, like asking "huh?"',
  3: 'dipping — go low then let it rise slightly',
  4: 'falling — start high and drop sharply',
};

// Extract tone number from pinyin (last char if digit 1-4)
function getToneNumber(pinyin) {
  if (!pinyin) return null;
  // Handle tone marks → number mapping
  const toneMap = {
    'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4,
    'ē': 1, 'é': 2, 'ě': 3, 'è': 4,
    'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4,
    'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4,
    'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4,
    'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4,
  };
  for (const ch of pinyin) {
    if (toneMap[ch]) return toneMap[ch];
  }
  // Check trailing digit
  const last = pinyin[pinyin.length - 1];
  if (last >= '1' && last <= '4') return parseInt(last);
  return null;
}

// Extract initial consonant from pinyin syllable
function getInitial(pinyin) {
  if (!pinyin) return null;
  const clean = pinyin.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, c => {
    const base = { 'ā':'a','á':'a','ǎ':'a','à':'a','ē':'e','é':'e','ě':'e','è':'e',
      'ī':'i','í':'i','ǐ':'i','ì':'i','ō':'o','ó':'o','ǒ':'o','ò':'o',
      'ū':'u','ú':'u','ǔ':'u','ù':'u','ǖ':'ü','ǘ':'ü','ǚ':'ü','ǜ':'ü' };
    return base[c] || c;
  }).replace(/[1-4]$/, '').toLowerCase();

  // Two-char initials first
  for (const init of ['zh', 'ch', 'sh']) {
    if (clean.startsWith(init)) return init;
  }
  // Single-char initials
  const singleInitials = 'bpmfdtnlgkhjqxrzcsyw';
  if (singleInitials.includes(clean[0])) return clean[0];
  return null;
}

/**
 * Generate feedback for a single word's pronunciation
 * @param {Object} wordData - { word, accuracyScore, errorType, syllables, phonemes }
 * @param {string} targetPinyin - pinyin for this word (e.g., "shāngdiàn")
 * @returns {{ feedback: string, severity: 'good'|'warning'|'error' }}
 */
export function generateWordFeedback(wordData, targetPinyin) {
  if (!wordData) return { feedback: '', severity: 'good' };

  // Omission
  if (wordData.errorType === 'Omission') {
    return {
      feedback: `You skipped ${wordData.word}${targetPinyin ? ` (${targetPinyin})` : ''} — make sure to say all words`,
      severity: 'error'
    };
  }

  // Insertion (extra word)
  if (wordData.errorType === 'Insertion') {
    return {
      feedback: `Extra word "${wordData.word}" — this wasn't in the target sentence`,
      severity: 'warning'
    };
  }

  const score = wordData.accuracyScore;

  // Good pronunciation
  if (score >= 80) {
    return { feedback: '', severity: 'good' };
  }

  // Find weakest syllable for targeted feedback
  let tip = '';
  if (wordData.syllables && wordData.syllables.length > 0) {
    const weakest = wordData.syllables.reduce((min, s) =>
      s.accuracyScore < min.accuracyScore ? s : min, wordData.syllables[0]);

    if (weakest.accuracyScore < 70) {
      // Try to match initial
      const initial = getInitial(weakest.syllable);
      if (initial && INITIAL_TIPS[initial]) {
        tip = INITIAL_TIPS[initial];
      }
    }
  }

  // Try tone-based feedback from pinyin
  if (!tip && targetPinyin) {
    const tone = getToneNumber(targetPinyin);
    if (tone && TONE_DESCRIPTIONS[tone]) {
      tip = `Focus on the ${tone}${tone === 1 ? 'st' : tone === 2 ? 'nd' : tone === 3 ? 'rd' : 'th'} tone — ${TONE_DESCRIPTIONS[tone]}`;
    }
  }

  if (score < 60) {
    return {
      feedback: tip || `Practice this word slowly — accuracy ${score}/100`,
      severity: 'error'
    };
  }

  // 60-79
  return {
    feedback: tip || `Getting close — try slowing down for clearer tones`,
    severity: 'warning'
  };
}

/**
 * Generate overall sentence feedback
 * @param {Object} pronunciationData - { accuracyScore, fluencyScore, completenessScore, words }
 * @param {Array} targetWords - [{ chinese, pinyin }] for each word in target sentence
 * @returns {{ overallScore, completeness, fluency, feedbackItems, summary }}
 */
export function generateSentenceFeedback(pronunciationData, targetWords = []) {
  if (!pronunciationData) {
    return { overallScore: 0, completeness: 0, fluency: 0, feedbackItems: [], summary: 'No pronunciation data available.' };
  }

  const { accuracyScore, fluencyScore, completenessScore, words = [] } = pronunciationData;
  const overallScore = Math.round((accuracyScore + fluencyScore + completenessScore) / 3);

  const feedbackItems = [];

  words.forEach((w, i) => {
    // Try to find matching pinyin from target words
    const targetPinyin = targetWords[i]?.pinyin || '';
    const { feedback, severity } = generateWordFeedback(w, targetPinyin);

    if (feedback || severity !== 'good') {
      feedbackItems.push({
        word: w.word,
        pinyin: targetPinyin,
        score: w.accuracyScore,
        errorType: w.errorType,
        feedback,
        severity,
        syllables: w.syllables || [],
        phonemes: w.phonemes || []
      });
    }
  });

  // Sort: errors first, then warnings
  feedbackItems.sort((a, b) => {
    const order = { error: 0, warning: 1, good: 2 };
    return (order[a.severity] || 2) - (order[b.severity] || 2);
  });

  // Generate summary
  let summary;
  if (overallScore >= 85) {
    summary = 'Excellent pronunciation! Keep it up.';
  } else if (overallScore >= 70) {
    const errorCount = feedbackItems.filter(f => f.severity === 'error').length;
    summary = errorCount > 0
      ? `Good effort! Focus on ${errorCount} word${errorCount > 1 ? 's' : ''} that need${errorCount === 1 ? 's' : ''} work.`
      : 'Good pronunciation — minor adjustments needed.';
  } else if (overallScore >= 50) {
    summary = 'Keep practicing — try listening again and repeat slowly.';
  } else {
    summary = 'Try listening to the sentence again at slow speed, then repeat one phrase at a time.';
  }

  return {
    overallScore,
    completeness: completenessScore,
    fluency: fluencyScore,
    feedbackItems,
    summary
  };
}
