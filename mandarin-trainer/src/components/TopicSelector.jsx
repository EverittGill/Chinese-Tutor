const TOPICS = [
  { id: 'open', emoji: '💬', chinese: '自由对话', english: 'Open Conversation', prompt: null },
  { id: 'review', emoji: '🔄', chinese: '复习模式', english: 'Review Mode', prompt: '__review__' },
  { id: 'teacher', emoji: '👨‍🏫', chinese: '老师模式', english: 'Teacher Mode', prompt: '__teacher__' },
  { id: 'restaurant', emoji: '🍜', chinese: '餐厅点餐', english: 'Restaurant', prompt: 'Ordering food at a Chinese restaurant. You are the waiter.' },
  { id: 'shopping', emoji: '🛍️', chinese: '商店购物', english: 'Shopping', prompt: 'Shopping at a store in China. You are the shopkeeper.' },
  { id: 'directions', emoji: '🗺️', chinese: '问路', english: 'Directions', prompt: 'The user is lost and asking for directions on a street in China. You are a helpful passerby.' },
  { id: 'introduction', emoji: '👋', chinese: '自我介绍', english: 'Introductions', prompt: 'Meeting someone new at a social gathering in China. Introduce yourself and get to know them.' },
  { id: 'weather', emoji: '☀️', chinese: '谈天气', english: 'Weather', prompt: 'Making small talk about the weather and daily plans.' },
  { id: 'travel', emoji: '✈️', chinese: '旅行', english: 'Travel', prompt: 'Discussing travel plans, places visited, and trip recommendations.' },
  { id: 'daily', emoji: '🏠', chinese: '日常生活', english: 'Daily Life', prompt: 'Talking about daily routines, habits, and schedule.' },
];

export default function TopicSelector({ onSelectTopic, onNavigate }) {
  const openTopic = TOPICS[0];
  const reviewTopic = TOPICS[1];
  const teacherTopic = TOPICS[2];
  const scenarioTopics = TOPICS.slice(3);

  return (
    <div className="min-h-dvh bg-warm-50 p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-warm-900">中文练习</h1>
            <p className="text-sm text-warm-600">Choose a conversation topic</p>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('settings')}
              className="text-warm-500 hover:text-warm-700 p-1 cursor-pointer transition-colors"
              aria-label="Settings"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
          )}
        </div>

        {/* Open conversation - full width */}
        <button
          onClick={() => onSelectTopic(openTopic)}
          className="w-full bg-warm-100 hover:bg-warm-200 rounded-2xl p-5 text-left transition-colors cursor-pointer shadow-soft"
        >
          <span className="text-2xl mr-3">{openTopic.emoji}</span>
          <span className="text-lg text-warm-900">{openTopic.chinese}</span>
          <span className="text-sm text-warm-600 ml-2">{openTopic.english}</span>
        </button>

        {/* Review mode - full width */}
        <button
          onClick={() => onSelectTopic(reviewTopic)}
          className="w-full bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <span className="text-2xl mr-3">{reviewTopic.emoji}</span>
          <span className="text-lg text-warm-900">{reviewTopic.chinese}</span>
          <span className="text-sm text-brand-600 ml-2">{reviewTopic.english}</span>
        </button>

        {/* Teacher mode - full width */}
        <button
          onClick={() => onSelectTopic(teacherTopic)}
          className="w-full bg-amber-900/40 hover:bg-amber-900/60 border border-amber-700/50 rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <span className="text-2xl mr-3">{teacherTopic.emoji}</span>
          <span className="text-lg text-warm-900">{teacherTopic.chinese}</span>
          <span className="text-sm text-amber-600 ml-2">{teacherTopic.english}</span>
        </button>

        {/* Scenario topics - 2 column grid */}
        <div className="grid grid-cols-2 gap-3">
          {scenarioTopics.map(topic => (
            <button
              key={topic.id}
              onClick={() => onSelectTopic(topic)}
              className="bg-warm-100 hover:bg-warm-200 rounded-xl p-4 text-left transition-colors cursor-pointer shadow-soft"
            >
              <div className="text-2xl mb-2">{topic.emoji}</div>
              <div className="text-sm text-warm-900">{topic.chinese}</div>
              <div className="text-xs text-warm-600">{topic.english}</div>
            </button>
          ))}
        </div>

        {/* Navigation buttons */}
        {onNavigate && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onNavigate('pronunciation')}
              className="bg-warm-100 hover:bg-warm-200 rounded-xl p-3 text-center transition-colors cursor-pointer shadow-soft"
            >
              <span className="text-lg mr-1">🎯</span>
              <span className="text-sm text-warm-700">Pronunciation</span>
            </button>
            <button
              onClick={() => onNavigate('flashcards')}
              className="bg-warm-100 hover:bg-warm-200 rounded-xl p-3 text-center transition-colors cursor-pointer shadow-soft"
            >
              <span className="text-lg mr-1">🃏</span>
              <span className="text-sm text-warm-700">Review</span>
            </button>
            <button
              onClick={() => onNavigate('vocab')}
              className="bg-warm-100 hover:bg-warm-200 rounded-xl p-3 text-center transition-colors cursor-pointer shadow-soft"
            >
              <span className="text-lg mr-1">📚</span>
              <span className="text-sm text-warm-700">Vocab</span>
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className="bg-warm-100 hover:bg-warm-200 rounded-xl p-3 text-center transition-colors cursor-pointer shadow-soft"
            >
              <span className="text-lg mr-1">📊</span>
              <span className="text-sm text-warm-700">Progress</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
