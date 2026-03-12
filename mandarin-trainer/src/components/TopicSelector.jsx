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
    <div className="min-h-dvh bg-slate-900 p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-50">中文练习</h1>
          <p className="text-sm text-slate-400">Choose a conversation topic</p>
        </div>

        {/* Open conversation - full width */}
        <button
          onClick={() => onSelectTopic(openTopic)}
          className="w-full bg-slate-800 hover:bg-slate-700 rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <span className="text-2xl mr-3">{openTopic.emoji}</span>
          <span className="text-lg text-slate-50">{openTopic.chinese}</span>
          <span className="text-sm text-slate-400 ml-2">{openTopic.english}</span>
        </button>

        {/* Review mode - full width */}
        <button
          onClick={() => onSelectTopic(reviewTopic)}
          className="w-full bg-teal-900/40 hover:bg-teal-900/60 border border-teal-700/50 rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <span className="text-2xl mr-3">{reviewTopic.emoji}</span>
          <span className="text-lg text-slate-50">{reviewTopic.chinese}</span>
          <span className="text-sm text-teal-400 ml-2">{reviewTopic.english}</span>
        </button>

        {/* Teacher mode - full width */}
        <button
          onClick={() => onSelectTopic(teacherTopic)}
          className="w-full bg-amber-900/40 hover:bg-amber-900/60 border border-amber-700/50 rounded-2xl p-5 text-left transition-colors cursor-pointer"
        >
          <span className="text-2xl mr-3">{teacherTopic.emoji}</span>
          <span className="text-lg text-slate-50">{teacherTopic.chinese}</span>
          <span className="text-sm text-amber-400 ml-2">{teacherTopic.english}</span>
        </button>

        {/* Scenario topics - 2 column grid */}
        <div className="grid grid-cols-2 gap-3">
          {scenarioTopics.map(topic => (
            <button
              key={topic.id}
              onClick={() => onSelectTopic(topic)}
              className="bg-slate-800 hover:bg-slate-700 rounded-xl p-4 text-left transition-colors cursor-pointer"
            >
              <div className="text-2xl mb-2">{topic.emoji}</div>
              <div className="text-sm text-slate-50">{topic.chinese}</div>
              <div className="text-xs text-slate-400">{topic.english}</div>
            </button>
          ))}
        </div>

        {/* Navigation buttons */}
        {onNavigate && (
          <div className="flex gap-3">
            <button
              onClick={() => onNavigate('flashcards')}
              className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-xl p-3 text-center transition-colors cursor-pointer"
            >
              <span className="text-lg mr-1">🃏</span>
              <span className="text-sm text-slate-300">Review</span>
            </button>
            <button
              onClick={() => onNavigate('vocab')}
              className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-xl p-3 text-center transition-colors cursor-pointer"
            >
              <span className="text-lg mr-1">📚</span>
              <span className="text-sm text-slate-300">Vocab</span>
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-xl p-3 text-center transition-colors cursor-pointer"
            >
              <span className="text-lg mr-1">📊</span>
              <span className="text-sm text-slate-300">Progress</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
