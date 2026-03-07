import { getSupabaseClient } from './supabase';

// Sessions

export async function createSession(topic) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('sessions')
    .insert({ topic })
    .select('id')
    .single();
  if (error) { console.error('createSession:', error); return null; }
  return data.id;
}

export async function endSession(id, stats) {
  const sb = getSupabaseClient();
  if (!sb) return;
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
  const sb = getSupabaseClient();
  if (!sb) return;
  const { error } = await sb
    .from('exchanges')
    .insert({
      session_id: sessionId,
      turn_number: turnNumber,
      user_text: userData.text,
      user_pronunciation_score: userData.pronunciationScore,
      user_fluency_score: userData.fluencyScore,
      user_word_scores: userData.wordScores,
      ai_response_json: aiData
    });
  if (error) console.error('saveExchange:', error);
}

// Vocabulary

export async function getVocabulary(status = null) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  let query = sb.from('vocabulary').select('*').order('updated_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) { console.error('getVocabulary:', error); return []; }
  return data;
}

export async function upsertWord(word, pinyin, english, source = 'conversation') {
  const sb = getSupabaseClient();
  if (!sb) return;
  const { error } = await sb
    .from('vocabulary')
    .upsert(
      {
        word,
        pinyin,
        english,
        source,
        status: 'learning',
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'word' }
    );
  if (error) console.error('upsertWord:', error);
}

export async function updateWordStats(word, wasCorrect, pronunciationScore) {
  const sb = getSupabaseClient();
  if (!sb) return;

  // First get current stats
  const { data, error: fetchError } = await sb
    .from('vocabulary')
    .select('times_seen, times_correct, times_incorrect, accuracy_avg, status')
    .eq('word', word)
    .single();

  if (fetchError || !data) return;

  const timesSeen = (data.times_seen || 0) + 1;
  const timesCorrect = (data.times_correct || 0) + (wasCorrect ? 1 : 0);
  const timesIncorrect = (data.times_incorrect || 0) + (wasCorrect ? 0 : 1);
  const accuracyAvg = pronunciationScore != null
    ? ((data.accuracy_avg || 0) * (timesSeen - 1) + pronunciationScore) / timesSeen
    : data.accuracy_avg || 0;

  // Auto-promote: correct 3+ times → known
  let status = data.status;
  if (timesCorrect >= 3 && status !== 'known') status = 'known';
  else if (accuracyAvg < 70 && status === 'known') status = 'learning';

  const { error } = await sb
    .from('vocabulary')
    .update({
      times_seen: timesSeen,
      times_correct: timesCorrect,
      times_incorrect: timesIncorrect,
      accuracy_avg: Math.round(accuracyAvg),
      status,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('word', word);

  if (error) console.error('updateWordStats:', error);
}

export async function importWords(wordList, status = 'new') {
  const sb = getSupabaseClient();
  if (!sb) return 0;

  const rows = wordList.map(w => ({
    word: w.word,
    pinyin: w.pinyin,
    english: w.english,
    status,
    source: 'import',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await sb
    .from('vocabulary')
    .upsert(rows, { onConflict: 'word' })
    .select('id');

  if (error) { console.error('importWords:', error); return 0; }
  return data?.length || 0;
}

export async function updateWordStatus(word, newStatus) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const { error } = await sb
    .from('vocabulary')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('word', word);
  if (error) console.error('updateWordStatus:', error);
}

// Mistakes

export async function recordMistakePattern(type, description, original, corrected) {
  const sb = getSupabaseClient();
  if (!sb) return;

  // Check if pattern exists
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
        example_corrected: corrected
      });
  }
}

export async function getMistakePatterns(limit = 10) {
  const sb = getSupabaseClient();
  if (!sb) return [];
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
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('getRecentSessions:', error); return []; }
  return data;
}

export async function getPronunciationTrend(days = 30) {
  const sb = getSupabaseClient();
  if (!sb) return [];
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
