// localStorage-backed database with the same API as Supabase db.js
// Mirrors the normalized vocabulary + user_vocabulary split.

function getStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch (e) { console.error(`localStorage parse failed for ${key}:`, e); return []; }
}

function setStore(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch (e) { console.error(`localStorage write failed for ${key}:`, e); }
}

function uuid() {
  return crypto.randomUUID();
}

// Settings

const SETTINGS_DEFAULTS = {
  user_name: '',
  user_context: '',
  tts_voice: 'zh-CN-XiaoxiaoNeural',
  pinyin_display_mode: 'characters_only',
};

export async function getSettings() {
  try { return { ...SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem('mt_settings')) }; }
  catch { return { ...SETTINGS_DEFAULTS }; }
}

export async function saveSettings(settings) {
  const existing = await getSettings();
  localStorage.setItem('mt_settings', JSON.stringify({ ...existing, ...settings }));
}

// Sessions

export async function createSession(topic) {
  const sessions = getStore('mt_sessions');
  const id = uuid();
  sessions.unshift({
    id,
    topic,
    started_at: new Date().toISOString(),
    ended_at: null,
    exchange_count: 0,
    avg_accuracy: null,
    avg_fluency: null,
    summary_json: null,
    corrections_json: null,
    new_words_json: null
  });
  setStore('mt_sessions', sessions);
  return id;
}

export async function endSession(id, stats) {
  const sessions = getStore('mt_sessions');
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  sessions[idx] = {
    ...sessions[idx],
    ended_at: new Date().toISOString(),
    exchange_count: stats.exchangeCount,
    avg_accuracy: stats.avgAccuracy,
    avg_fluency: stats.avgFluency,
    summary_json: stats.summary || null,
    corrections_json: stats.corrections || null,
    new_words_json: stats.newWords || null
  };
  setStore('mt_sessions', sessions);
}

// Exchanges

export async function saveExchange(sessionId, turnNumber, userData, aiData) {
  const exchanges = getStore('mt_exchanges');
  exchanges.push({
    id: uuid(),
    session_id: sessionId,
    turn_number: turnNumber,
    user_text: userData.text,
    user_pronunciation_score: userData.pronunciationScore,
    user_fluency_score: userData.fluencyScore,
    user_word_scores: userData.wordScores,
    ai_response_json: aiData,
    created_at: new Date().toISOString()
  });
  setStore('mt_exchanges', exchanges);
}

// Vocabulary — normalized: mt_vocab_dict (dictionary) + mt_user_vocab (progress)

function getVocabDict() { return getStore('mt_vocab_dict'); }
function setVocabDict(d) { setStore('mt_vocab_dict', d); }
function getUserVocab() { return getStore('mt_user_vocab'); }
function setUserVocab(d) { setStore('mt_user_vocab', d); }

// Returns flattened word objects (merged dict + user progress) for backward compat
export async function getVocabulary(status = null) {
  const dict = getVocabDict();
  let uv = getUserVocab();
  if (status) uv = uv.filter(u => u.status === status);

  return uv
    .map(u => {
      const v = dict.find(d => d.id === u.vocabulary_id);
      if (!v) return null;
      return {
        id: u.id,
        vocabulary_id: u.vocabulary_id,
        word: v.word,
        pinyin: v.pinyin,
        english: v.english,
        hsk_level: v.hsk_level,
        status: u.status,
        context_sentence: u.context_sentence,
        source: u.source,
        times_seen: u.times_seen,
        times_correct: u.times_correct,
        times_incorrect: u.times_incorrect,
        accuracy_avg: u.accuracy_avg,
        difficulty: u.difficulty,
        stability: u.stability,
        retrievability: u.retrievability,
        reps: u.reps,
        lapses: u.lapses,
        state: u.state,
        due_date: u.due_date,
        last_reviewed: u.last_reviewed,
        created_at: u.created_at,
        updated_at: u.updated_at
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function upsertWord(word, pinyin, english, source = 'conversation', contextSentence = null) {
  const now = new Date().toISOString();

  // 1. Upsert dictionary
  const dict = getVocabDict();
  let dictIdx = dict.findIndex(d => d.word === word);
  let vocabId;
  if (dictIdx !== -1) {
    dict[dictIdx] = { ...dict[dictIdx], pinyin, english };
    vocabId = dict[dictIdx].id;
  } else {
    vocabId = uuid();
    dict.push({ id: vocabId, word, pinyin, english, hsk_level: null, part_of_speech: null, measure_word: null, created_at: now });
  }
  setVocabDict(dict);

  // 2. Upsert user_vocabulary
  const uv = getUserVocab();
  const uvIdx = uv.findIndex(u => u.vocabulary_id === vocabId);
  if (uvIdx !== -1) {
    uv[uvIdx] = { ...uv[uvIdx], source, updated_at: now };
    if (contextSentence) uv[uvIdx].context_sentence = contextSentence;
  } else {
    uv.push({
      id: uuid(), vocabulary_id: vocabId, status: 'learning', context_sentence: contextSentence || null,
      source, difficulty: 0, stability: 0, retrievability: 1, reps: 0, lapses: 0, state: 0,
      due_date: now, last_reviewed: null,
      times_seen: 0, times_correct: 0, times_incorrect: 0, accuracy_avg: 0, tone_accuracy_avg: 0,
      created_at: now, updated_at: now
    });
  }
  setUserVocab(uv);
}

export async function updateWordStats(word, wasCorrect, pronunciationScore) {
  const dict = getVocabDict();
  const vocabEntry = dict.find(d => d.word === word);
  if (!vocabEntry) return;

  const uv = getUserVocab();
  const idx = uv.findIndex(u => u.vocabulary_id === vocabEntry.id);
  if (idx === -1) return;

  const data = uv[idx];
  const timesSeen = (data.times_seen || 0) + 1;
  const timesCorrect = (data.times_correct || 0) + (wasCorrect ? 1 : 0);
  const timesIncorrect = (data.times_incorrect || 0) + (wasCorrect ? 0 : 1);
  const accuracyAvg = pronunciationScore != null
    ? ((data.accuracy_avg || 0) * (timesSeen - 1) + pronunciationScore) / timesSeen
    : data.accuracy_avg || 0;

  let status = data.status;
  if (timesCorrect >= 3 && status !== 'known') status = 'known';
  else if (accuracyAvg < 70 && status === 'known') status = 'learning';

  uv[idx] = {
    ...data,
    times_seen: timesSeen,
    times_correct: timesCorrect,
    times_incorrect: timesIncorrect,
    accuracy_avg: Math.round(accuracyAvg),
    status,
    updated_at: new Date().toISOString()
  };
  setUserVocab(uv);
}

export async function importWords(wordList, status = 'new') {
  const now = new Date().toISOString();
  const dict = getVocabDict();
  const uv = getUserVocab();
  let count = 0;

  for (const w of wordList) {
    // Upsert dictionary
    let dictIdx = dict.findIndex(d => d.word === w.word);
    let vocabId;
    if (dictIdx !== -1) {
      dict[dictIdx] = { ...dict[dictIdx], pinyin: w.pinyin, english: w.english };
      vocabId = dict[dictIdx].id;
    } else {
      vocabId = uuid();
      dict.push({ id: vocabId, word: w.word, pinyin: w.pinyin, english: w.english, hsk_level: null, part_of_speech: null, measure_word: null, created_at: now });
    }

    // Upsert user_vocabulary
    const uvIdx = uv.findIndex(u => u.vocabulary_id === vocabId);
    if (uvIdx !== -1) {
      uv[uvIdx] = { ...uv[uvIdx], status, source: 'import', updated_at: now };
    } else {
      uv.push({
        id: uuid(), vocabulary_id: vocabId, status, context_sentence: null,
        source: 'import', difficulty: 0, stability: 0, retrievability: 1, reps: 0, lapses: 0, state: 0,
        due_date: now, last_reviewed: null,
        times_seen: 0, times_correct: 0, times_incorrect: 0, accuracy_avg: 0, tone_accuracy_avg: 0,
        created_at: now, updated_at: now
      });
    }
    count++;
  }

  setVocabDict(dict);
  setUserVocab(uv);
  return count;
}

export async function updateWordStatus(word, newStatus) {
  const dict = getVocabDict();
  const vocabEntry = dict.find(d => d.word === word);
  if (!vocabEntry) return;

  const uv = getUserVocab();
  const idx = uv.findIndex(u => u.vocabulary_id === vocabEntry.id);
  if (idx === -1) return;
  uv[idx] = { ...uv[idx], status: newStatus, updated_at: new Date().toISOString() };
  setUserVocab(uv);
}

// FSRS Review functions

export async function getDueVocabulary(limit = 20) {
  const now = new Date().toISOString();
  const dict = getVocabDict();
  const uv = getUserVocab();

  return uv
    .filter(u => u.due_date <= now)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    .slice(0, limit)
    .map(u => {
      const v = dict.find(d => d.id === u.vocabulary_id);
      if (!v) return null;
      return {
        id: u.id, vocabulary_id: u.vocabulary_id,
        word: v.word, pinyin: v.pinyin, english: v.english, hsk_level: v.hsk_level,
        context_sentence: u.context_sentence, status: u.status,
        difficulty: u.difficulty, stability: u.stability, retrievability: u.retrievability,
        reps: u.reps, lapses: u.lapses, state: u.state,
        due_date: u.due_date, last_reviewed: u.last_reviewed
      };
    })
    .filter(Boolean);
}

export async function updateFSRSCard(userVocabId, fsrsUpdate) {
  const uv = getUserVocab();
  const idx = uv.findIndex(u => u.id === userVocabId);
  if (idx === -1) return;
  uv[idx] = {
    ...uv[idx],
    difficulty: fsrsUpdate.difficulty,
    stability: fsrsUpdate.stability,
    retrievability: fsrsUpdate.retrievability,
    reps: fsrsUpdate.reps,
    lapses: fsrsUpdate.lapses,
    state: fsrsUpdate.state,
    due_date: fsrsUpdate.due_date,
    last_reviewed: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  setUserVocab(uv);
}

export async function saveReviewLog(userVocabId, rating, durationMs, scheduledDays, actualDays) {
  const logs = getStore('mt_review_log');
  logs.push({
    id: uuid(),
    user_vocabulary_id: userVocabId,
    rating,
    review_duration_ms: durationMs,
    scheduled_days: scheduledDays,
    actual_days: actualDays,
    reviewed_at: new Date().toISOString()
  });
  setStore('mt_review_log', logs);
}

// Mistakes

export async function recordMistakePattern(type, description, original, corrected) {
  const mistakes = getStore('mt_mistakes');
  const idx = mistakes.findIndex(m => m.description === description);

  if (idx !== -1) {
    mistakes[idx] = {
      ...mistakes[idx],
      occurrence_count: mistakes[idx].occurrence_count + 1,
      last_occurred_at: new Date().toISOString(),
      example_original: original,
      example_corrected: corrected
    };
  } else {
    mistakes.push({
      id: uuid(),
      pattern_type: type,
      description,
      example_original: original,
      example_corrected: corrected,
      occurrence_count: 1,
      last_occurred_at: new Date().toISOString(),
      resolved: false,
      created_at: new Date().toISOString()
    });
  }
  setStore('mt_mistakes', mistakes);
}

export async function getMistakePatterns(limit = 10) {
  const mistakes = getStore('mt_mistakes')
    .filter(m => !m.resolved)
    .sort((a, b) => b.occurrence_count - a.occurrence_count);
  return mistakes.slice(0, limit);
}

// Stats

export async function getRecentSessions(limit = 10) {
  const sessions = getStore('mt_sessions')
    .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
  return sessions.slice(0, limit);
}

// Pronunciation trainer

// Returns true if the string is mostly Chinese characters (not teacher notes / English explanations)
function isPrimarilyChinese(str) {
  if (!str || str.length === 0) return false;
  let chineseCount = 0;
  let totalAlphanumeric = 0;
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) { chineseCount++; totalAlphanumeric++; }
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) { totalAlphanumeric++; }
  }
  if (totalAlphanumeric === 0) return false;
  return chineseCount / totalAlphanumeric > 0.5;
}

export async function getPronunciationSentences(limit = 15) {
  const seen = new Set();
  const results = [];

  const addUnique = (chinese, pinyin, english) => {
    if (!chinese || seen.has(chinese)) return;
    seen.add(chinese);
    results.push({ chinese, pinyin: pinyin || '', english: english || '' });
  };

  // Vocabulary context sentences (prioritize low-accuracy words)
  const uv = getUserVocab()
    .filter(u => u.context_sentence)
    .sort((a, b) => (a.accuracy_avg || 0) - (b.accuracy_avg || 0));

  uv.forEach(u => {
    if (u.context_sentence) {
      if (typeof u.context_sentence === 'object') {
        addUnique(u.context_sentence.chinese, u.context_sentence.pinyin, u.context_sentence.english);
      } else if (isPrimarilyChinese(u.context_sentence)) {
        addUnique(u.context_sentence, '', '');
      }
    }
  });

  return results.slice(0, limit);
}

export async function savePronunciationAttempt(referenceText, referencePinyin, scores, wordScores) {
  const attempts = getStore('mt_shadowing');
  attempts.push({
    id: uuid(),
    reference_text: referenceText,
    reference_pinyin: referencePinyin,
    accuracy_score: scores.accuracy,
    fluency_score: scores.fluency,
    completeness_score: scores.completeness,
    pronunciation_score: scores.overall,
    word_scores: wordScores,
    created_at: new Date().toISOString()
  });
  setStore('mt_shadowing', attempts);
}

// Streaks

async function updateStreak() {
  const settings = await getSettings();
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = settings.last_practice_date || null;

  if (lastDate === today) return;

  let currentStreak = settings.current_streak || 0;
  const longestStreak = settings.longest_streak || 0;

  if (lastDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    if (lastDate === yesterdayStr) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }
  } else {
    currentStreak = 1;
  }

  await saveSettings({
    current_streak: currentStreak,
    longest_streak: Math.max(longestStreak, currentStreak),
    last_practice_date: today
  });
}

export async function recordPractice() {
  await updateStreak();
}

// Shadowing sentences

export async function getShadowingSentences(limit = 15) {
  const seen = new Set();
  const results = [];

  const addUnique = (chinese, pinyin, english) => {
    if (!chinese || seen.has(chinese)) return;
    seen.add(chinese);
    results.push({ chinese, pinyin: pinyin || '', english: english || '' });
  };

  const sessions = getStore('mt_sessions')
    .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
    .slice(0, 10);

  sessions.forEach(s => {
    if (s.summary_json?.practice_sentences) {
      s.summary_json.practice_sentences.forEach(ps => {
        addUnique(ps.chinese, ps.pinyin, ps.english);
      });
    }
    if (s.corrections_json) {
      s.corrections_json.forEach(c => {
        if (c.corrected) {
          addUnique(c.corrected, c.pinyin || '', c.explanation || '');
        }
      });
    }
  });

  return results.slice(0, limit);
}

export async function getPronunciationTrend(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const cutoff = since.toISOString();

  return getStore('mt_sessions')
    .filter(s => s.avg_accuracy != null && s.started_at >= cutoff)
    .sort((a, b) => (a.started_at || '').localeCompare(b.started_at || ''));
}
