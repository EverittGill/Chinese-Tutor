import { getSupabaseClient } from './supabase';
import * as local from './localDb.js';

// If Supabase is configured, use it. Otherwise fall back to localStorage.
function useSupabase() {
  return !!getSupabaseClient();
}

// Get current authenticated user's ID
async function getCurrentUserId() {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user?.id ?? null;
}

// Settings

export async function getSettings() {
  if (!useSupabase()) return local.getSettings();
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('user_settings')
    .select('*')
    .single();
  if (error || !data) {
    // New user — return defaults
    return { user_name: '', user_context: '', tts_voice: 'zh-CN-XiaoxiaoNeural', pinyin_display_mode: 'characters_only' };
  }
  return data;
}

export async function saveSettings(settings) {
  if (!useSupabase()) return local.saveSettings(settings);
  const userId = await getCurrentUserId();
  if (!userId) return;
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('user_settings')
    .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.error('saveSettings:', error);
}

// Sessions

export async function createSession(topic) {
  if (!useSupabase()) return local.createSession(topic);
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('sessions')
    .insert({ topic, user_id: userId })
    .select('id')
    .single();
  if (error) { console.error('createSession:', error); return null; }
  return data.id;
}

export async function endSession(id, stats) {
  if (!useSupabase()) return local.endSession(id, stats);
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('sessions')
    .update({
      ended_at: new Date().toISOString(),
      exchange_count: stats.exchangeCount,
      avg_accuracy: stats.avgAccuracy,
      avg_fluency: stats.avgFluency,
      summary_json: stats.summary || null,
      corrections_json: stats.corrections || null,
      new_words_json: stats.newWords || null
    })
    .eq('id', id);
  if (error) console.error('endSession:', error);
}

// Exchanges

export async function saveExchange(sessionId, turnNumber, userData, aiData) {
  if (!useSupabase()) return local.saveExchange(sessionId, turnNumber, userData, aiData);
  const userId = await getCurrentUserId();
  if (!userId) return;
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('exchanges')
    .insert({
      session_id: sessionId,
      turn_number: turnNumber,
      user_text: userData.text,
      user_pronunciation_score: userData.pronunciationScore,
      user_fluency_score: userData.fluencyScore,
      user_word_scores: userData.wordScores,
      ai_response_json: aiData,
      user_id: userId,
    });
  if (error) console.error('saveExchange:', error);
}

// Vocabulary — normalized: vocabulary (dictionary) + user_vocabulary (progress)

export async function getVocabulary(status = null) {
  if (!useSupabase()) return local.getVocabulary(status);
  const sb = getSupabaseClient();
  let query = sb
    .from('user_vocabulary')
    .select('*, vocabulary(*)')
    .order('updated_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) { console.error('getVocabulary:', error); return []; }
  // Flatten: merge vocabulary fields into top level for backward compat
  return (data || []).map(uv => ({
    id: uv.id,
    vocabulary_id: uv.vocabulary_id,
    word: uv.vocabulary.word,
    pinyin: uv.vocabulary.pinyin,
    english: uv.vocabulary.english,
    hsk_level: uv.vocabulary.hsk_level,
    status: uv.status,
    context_sentence: uv.context_sentence,
    source: uv.source,
    times_seen: uv.times_seen,
    times_correct: uv.times_correct,
    times_incorrect: uv.times_incorrect,
    accuracy_avg: uv.accuracy_avg,
    // FSRS fields
    difficulty: uv.difficulty,
    stability: uv.stability,
    retrievability: uv.retrievability,
    reps: uv.reps,
    lapses: uv.lapses,
    state: uv.state,
    due_date: uv.due_date,
    last_reviewed: uv.last_reviewed,
    created_at: uv.created_at,
    updated_at: uv.updated_at
  }));
}

export async function upsertWord(word, pinyin, english, source = 'conversation', contextSentence = null) {
  if (!useSupabase()) return local.upsertWord(word, pinyin, english, source, contextSentence);
  const userId = await getCurrentUserId();
  if (!userId) return;
  const sb = getSupabaseClient();

  // 1. Upsert into vocabulary (dictionary)
  const { data: vocabRow, error: vocabErr } = await sb
    .from('vocabulary')
    .upsert({ word, pinyin, english }, { onConflict: 'word' })
    .select('id')
    .single();
  if (vocabErr) { console.error('upsertWord vocab:', vocabErr); return; }

  // 2. Upsert into user_vocabulary (progress)
  const uvData = {
    vocabulary_id: vocabRow.id,
    user_id: userId,
    source,
    status: 'learning',
    updated_at: new Date().toISOString()
  };
  if (contextSentence) uvData.context_sentence = contextSentence;

  const { error: uvErr } = await sb
    .from('user_vocabulary')
    .upsert(uvData, { onConflict: 'user_id, vocabulary_id' });
  if (uvErr) console.error('upsertWord user_vocab:', uvErr);
}

export async function updateWordStats(word, wasCorrect, pronunciationScore) {
  if (!useSupabase()) return local.updateWordStats(word, wasCorrect, pronunciationScore);
  const sb = getSupabaseClient();

  // Look up vocabulary_id by word, then get user_vocabulary
  const { data: vocabRow } = await sb
    .from('vocabulary')
    .select('id')
    .eq('word', word)
    .single();
  if (!vocabRow) return;

  const { data: uv, error: fetchError } = await sb
    .from('user_vocabulary')
    .select('id, times_seen, times_correct, times_incorrect, accuracy_avg, status')
    .eq('vocabulary_id', vocabRow.id)
    .single();

  if (fetchError || !uv) return;

  const timesSeen = (uv.times_seen || 0) + 1;
  const timesCorrect = (uv.times_correct || 0) + (wasCorrect ? 1 : 0);
  const timesIncorrect = (uv.times_incorrect || 0) + (wasCorrect ? 0 : 1);
  const accuracyAvg = pronunciationScore != null
    ? ((uv.accuracy_avg || 0) * (timesSeen - 1) + pronunciationScore) / timesSeen
    : uv.accuracy_avg || 0;

  // Auto-promote: correct 3+ times → known
  let status = uv.status;
  if (timesCorrect >= 3 && status !== 'known') status = 'known';
  else if (accuracyAvg < 70 && status === 'known') status = 'learning';

  const { error } = await sb
    .from('user_vocabulary')
    .update({
      times_seen: timesSeen,
      times_correct: timesCorrect,
      times_incorrect: timesIncorrect,
      accuracy_avg: Math.round(accuracyAvg),
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', uv.id);

  if (error) console.error('updateWordStats:', error);
}

export async function importWords(wordList, status = 'new') {
  if (!useSupabase()) return local.importWords(wordList, status);
  const userId = await getCurrentUserId();
  if (!userId) return 0;
  const sb = getSupabaseClient();
  let count = 0;

  for (const w of wordList) {
    // Upsert dictionary entry
    const { data: vocabRow, error: vocabErr } = await sb
      .from('vocabulary')
      .upsert({ word: w.word, pinyin: w.pinyin, english: w.english }, { onConflict: 'word' })
      .select('id')
      .single();
    if (vocabErr) { console.error('importWords vocab:', vocabErr); continue; }

    // Upsert user_vocabulary
    const { error: uvErr } = await sb
      .from('user_vocabulary')
      .upsert({
        vocabulary_id: vocabRow.id,
        user_id: userId,
        status,
        source: 'import',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, vocabulary_id' });
    if (!uvErr) count++;
  }

  return count;
}

export async function updateWordStatus(word, newStatus) {
  if (!useSupabase()) return local.updateWordStatus(word, newStatus);
  const sb = getSupabaseClient();

  const { data: vocabRow } = await sb
    .from('vocabulary')
    .select('id')
    .eq('word', word)
    .single();
  if (!vocabRow) return;

  const { error } = await sb
    .from('user_vocabulary')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('vocabulary_id', vocabRow.id);
  if (error) console.error('updateWordStatus:', error);
}

// FSRS Review functions

export async function getDueVocabulary(limit = 20) {
  if (!useSupabase()) return local.getDueVocabulary(limit);
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('user_vocabulary')
    .select('*, vocabulary(*)')
    .lte('due_date', new Date().toISOString())
    .order('due_date', { ascending: true })
    .limit(limit);
  if (error) { console.error('getDueVocabulary:', error); return []; }
  return (data || []).map(uv => ({
    id: uv.id,
    vocabulary_id: uv.vocabulary_id,
    word: uv.vocabulary.word,
    pinyin: uv.vocabulary.pinyin,
    english: uv.vocabulary.english,
    hsk_level: uv.vocabulary.hsk_level,
    context_sentence: uv.context_sentence,
    status: uv.status,
    difficulty: uv.difficulty,
    stability: uv.stability,
    retrievability: uv.retrievability,
    reps: uv.reps,
    lapses: uv.lapses,
    state: uv.state,
    due_date: uv.due_date,
    last_reviewed: uv.last_reviewed
  }));
}

export async function updateFSRSCard(userVocabId, fsrsUpdate) {
  if (!useSupabase()) return local.updateFSRSCard(userVocabId, fsrsUpdate);
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('user_vocabulary')
    .update({
      difficulty: fsrsUpdate.difficulty,
      stability: fsrsUpdate.stability,
      retrievability: fsrsUpdate.retrievability,
      reps: fsrsUpdate.reps,
      lapses: fsrsUpdate.lapses,
      state: fsrsUpdate.state,
      due_date: fsrsUpdate.due_date,
      last_reviewed: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', userVocabId);
  if (error) console.error('updateFSRSCard:', error);
}

export async function saveReviewLog(userVocabId, rating, durationMs, scheduledDays, actualDays) {
  if (!useSupabase()) return local.saveReviewLog(userVocabId, rating, durationMs, scheduledDays, actualDays);
  const userId = await getCurrentUserId();
  if (!userId) return;
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('review_log')
    .insert({
      user_vocabulary_id: userVocabId,
      rating,
      review_duration_ms: durationMs,
      scheduled_days: scheduledDays,
      actual_days: actualDays,
      user_id: userId,
    });
  if (error) console.error('saveReviewLog:', error);
}

// Mistakes

export async function recordMistakePattern(type, description, original, corrected) {
  if (!useSupabase()) return local.recordMistakePattern(type, description, original, corrected);
  const userId = await getCurrentUserId();
  if (!userId) return;
  const sb = getSupabaseClient();

  // Check if pattern exists (RLS filters by user_id automatically)
  const { data } = await sb
    .from('mistake_patterns')
    .select('id, occurrence_count')
    .eq('description', description)
    .single();

  if (data) {
    await sb
      .from('mistake_patterns')
      .update({
        occurrence_count: data.occurrence_count + 1,
        last_occurred_at: new Date().toISOString(),
        example_original: original,
        example_corrected: corrected
      })
      .eq('id', data.id);
  } else {
    await sb
      .from('mistake_patterns')
      .insert({
        pattern_type: type,
        description,
        example_original: original,
        example_corrected: corrected,
        user_id: userId,
      });
  }
}

export async function getMistakePatterns(limit = 10) {
  if (!useSupabase()) return local.getMistakePatterns(limit);
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('mistake_patterns')
    .select('*')
    .eq('resolved', false)
    .order('occurrence_count', { ascending: false })
    .limit(limit);
  if (error) { console.error('getMistakePatterns:', error); return []; }
  return data;
}

// Stats

export async function getRecentSessions(limit = 10) {
  if (!useSupabase()) return local.getRecentSessions(limit);
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('getRecentSessions:', error); return []; }
  return data;
}

// Pronunciation trainer

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
  if (!useSupabase()) return local.getPronunciationSentences(limit);
  const sb = getSupabaseClient();
  const seen = new Set();
  const results = [];

  const addUnique = (chinese, pinyin, english) => {
    if (!chinese || seen.has(chinese)) return;
    seen.add(chinese);
    results.push({ chinese, pinyin: pinyin || '', english: english || '' });
  };

  // 1. Vocabulary context sentences (prioritize low-accuracy words)
  const { data: vocabData } = await sb
    .from('user_vocabulary')
    .select('context_sentence, accuracy_avg, vocabulary(word, pinyin, english)')
    .not('context_sentence', 'is', null)
    .order('accuracy_avg', { ascending: true })
    .limit(limit);

  if (vocabData) {
    vocabData.forEach(uv => {
      if (uv.context_sentence) {
        // context_sentence may be stored as { chinese, pinyin, english } or just a string
        if (typeof uv.context_sentence === 'object') {
          addUnique(uv.context_sentence.chinese, uv.context_sentence.pinyin, uv.context_sentence.english);
        } else if (isPrimarilyChinese(uv.context_sentence)) {
          addUnique(uv.context_sentence, '', '');
        }
      }
    });
  }

  return results.slice(0, limit);
}

export async function savePronunciationAttempt(referenceText, referencePinyin, scores, wordScores) {
  if (!useSupabase()) return local.savePronunciationAttempt(referenceText, referencePinyin, scores, wordScores);
  const userId = await getCurrentUserId();
  if (!userId) return;
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('shadowing_attempts')
    .insert({
      reference_text: referenceText,
      reference_pinyin: referencePinyin,
      accuracy_score: scores.accuracy,
      fluency_score: scores.fluency,
      completeness_score: scores.completeness,
      pronunciation_score: scores.overall,
      word_scores: wordScores,
      user_id: userId,
    });
  if (error) console.error('savePronunciationAttempt:', error);
}

export async function getPronunciationTrend(days = 30) {
  if (!useSupabase()) return local.getPronunciationTrend(days);
  const sb = getSupabaseClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await sb
    .from('sessions')
    .select('started_at, avg_accuracy')
    .not('avg_accuracy', 'is', null)
    .gte('started_at', since.toISOString())
    .order('started_at', { ascending: true });
  if (error) { console.error('getPronunciationTrend:', error); return []; }
  return data;
}
