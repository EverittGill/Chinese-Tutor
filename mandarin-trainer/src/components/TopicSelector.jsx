import { useState } from 'react';
import { getAzureConfig, setAzureConfig, getSupabaseConfig, setSupabaseConfig } from '../utils/config';
import { resetSupabaseClient } from '../utils/supabase';

const TOPICS = [
  { id: 'open', emoji: '💬', chinese: '自由对话', english: 'Open Conversation', prompt: null },
  { id: 'restaurant', emoji: '🍜', chinese: '餐厅点餐', english: 'Restaurant', prompt: 'Ordering food at a Chinese restaurant. You are the waiter.' },
  { id: 'shopping', emoji: '🛍️', chinese: '商店购物', english: 'Shopping', prompt: 'Shopping at a store in China. You are the shopkeeper.' },
  { id: 'directions', emoji: '🗺️', chinese: '问路', english: 'Directions', prompt: 'The user is lost and asking for directions on a street in China. You are a helpful passerby.' },
  { id: 'introduction', emoji: '👋', chinese: '自我介绍', english: 'Introductions', prompt: 'Meeting someone new at a social gathering in China. Introduce yourself and get to know them.' },
  { id: 'weather', emoji: '☀️', chinese: '谈天气', english: 'Weather', prompt: 'Making small talk about the weather and daily plans.' },
  { id: 'travel', emoji: '✈️', chinese: '旅行', english: 'Travel', prompt: 'Discussing travel plans, places visited, and trip recommendations.' },
  { id: 'daily', emoji: '🏠', chinese: '日常生活', english: 'Daily Life', prompt: 'Talking about daily routines, habits, and schedule.' },
];

const REGIONS = [
  'eastus', 'eastus2', 'westus', 'westus2',
  'centralus', 'northeurope', 'westeurope', 'southeastasia'
];

function SettingsModal({ onClose }) {
  const azureExisting = getAzureConfig();
  const supabaseExisting = getSupabaseConfig();
  const [key, setKey] = useState(azureExisting.key);
  const [region, setRegion] = useState(azureExisting.region || REGIONS[0]);
  const [sbUrl, setSbUrl] = useState(supabaseExisting.url);
  const [sbKey, setSbKey] = useState(supabaseExisting.anonKey);

  function handleSave(e) {
    e.preventDefault();
    if (!key.trim()) return;
    setAzureConfig(key.trim(), region);
    if (sbUrl.trim() && sbKey.trim()) {
      setSupabaseConfig(sbUrl.trim(), sbKey.trim());
      resetSupabaseClient();
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSave} className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-50">Settings</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl cursor-pointer">✕</button>
        </div>
        <h4 className="text-xs font-medium text-teal-400 uppercase tracking-wider">Azure Speech</h4>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Speech Key</label>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Region</label>
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500"
          >
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <h4 className="text-xs font-medium text-teal-400 uppercase tracking-wider pt-2">Supabase</h4>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Project URL</label>
          <input
            type="text"
            value={sbUrl}
            onChange={e => setSbUrl(e.target.value)}
            placeholder="https://xxxxx.supabase.co"
            className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Anon Key</label>
          <input
            type="password"
            value={sbKey}
            onChange={e => setSbKey(e.target.value)}
            className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-500"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg py-2.5 transition-colors cursor-pointer"
        >
          Save
        </button>
      </form>
    </div>
  );
}

export default function TopicSelector({ onSelectTopic, onNavigate }) {
  const [showSettings, setShowSettings] = useState(false);

  const openTopic = TOPICS[0];
  const scenarioTopics = TOPICS.slice(1);

  return (
    <div className="min-h-dvh bg-slate-900 p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">中文练习</h1>
            <p className="text-sm text-slate-400">Choose a conversation topic</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="text-slate-400 hover:text-slate-200 text-xl cursor-pointer"
          >
            ⚙️
          </button>
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
              onClick={() => onNavigate('vocab')}
              className="flex-1 bg-slate-800 hover:bg-slate-700 rounded-xl p-3 text-center transition-colors cursor-pointer"
            >
              <span className="text-lg mr-1">📚</span>
              <span className="text-sm text-slate-300">Vocabulary</span>
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

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
