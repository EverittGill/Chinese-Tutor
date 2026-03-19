import { useState, useEffect, useCallback } from 'react';
import { getSettings, saveSettings } from '../utils/db';
import useAzureTTS from '../hooks/useAzureTTS';
import useAuth from '../hooks/useAuth';
import { getSupabaseClient } from '../utils/supabase';

const VOICE_OPTIONS = [
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', desc: 'Female, warm & friendly', default: true },
  { id: 'zh-CN-XiaoyiNeural', name: 'Xiaoyi', desc: 'Female, gentle' },
  { id: 'zh-CN-XiaohanNeural', name: 'Xiaohan', desc: 'Female, affectionate & expressive' },
  { id: 'zh-CN-XiaomengNeural', name: 'Xiaomeng', desc: 'Female, sweet & chatty' },
  { id: 'zh-CN-XiaochenNeural', name: 'Xiaochen', desc: 'Female, mature & expressive' },
  { id: 'zh-CN-XiaorouNeural', name: 'Xiaorou', desc: 'Female, soft & smooth' },
  { id: 'zh-CN-XiaozhenNeural', name: 'Xiaozhen', desc: 'Female, bold & spirited' },
  { id: 'zh-CN-XiaoruiNeural', name: 'Xiaorui', desc: 'Female, calm & composed' },
  { id: 'zh-CN-YunjianNeural', name: 'Yunjian', desc: 'Male, confident' },
  { id: 'zh-CN-YunxiNeural', name: 'Yunxi', desc: 'Male, casual & warm' },
  { id: 'zh-CN-YunyangNeural', name: 'Yunyang', desc: 'Male, professional' },
  { id: 'zh-CN-liaoning-XiaobeiNeural', name: 'Xiaobei', desc: 'Female, Liaoning accent' },
];

const PREVIEW_TEXT = '你好！很高兴认识你。';

export default function SettingsScreen({ onBack }) {
  const { user, credits, signOut, refreshCredits } = useAuth();
  const [userName, setUserName] = useState('');
  const [userContext, setUserContext] = useState('');
  const [ttsVoice, setTtsVoice] = useState('zh-CN-XiaoxiaoNeural');
  const [pinyinDisplayMode, setPinyinDisplayMode] = useState('characters_only');
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState(null);
  const [promoSuccess, setPromoSuccess] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const { speak, isSpeaking } = useAzureTTS(ttsVoice);

  useEffect(() => {
    getSettings().then(s => {
      setUserName(s.user_name || '');
      setUserContext(s.user_context || '');
      setTtsVoice(s.tts_voice || 'zh-CN-XiaoxiaoNeural');
      setPinyinDisplayMode(s.pinyin_display_mode || 'characters_only');
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    await saveSettings({ user_name: userName.trim(), user_context: userContext.trim(), tts_voice: ttsVoice, pinyin_display_mode: pinyinDisplayMode });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDisplayModeSelect = useCallback(async (mode) => {
    setPinyinDisplayMode(mode);
    await saveSettings({ pinyin_display_mode: mode });
  }, []);

  const handleVoiceSelect = useCallback(async (voiceId) => {
    setTtsVoice(voiceId);
    await saveSettings({ tts_voice: voiceId });
  }, []);

  const handlePreview = useCallback(() => {
    if (!isSpeaking) {
      speak(PREVIEW_TEXT);
    }
  }, [speak, isSpeaking]);

  if (!loaded) return null;

  return (
    <div className="min-h-dvh bg-warm-50 p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-warm-600 hover:text-warm-900 text-sm cursor-pointer">
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold text-warm-900">Settings</h1>
        </div>

        {/* Profile card */}
        <div className="bg-warm-100 rounded-2xl p-5 shadow-soft space-y-4">
          <h2 className="text-lg font-semibold text-warm-900">Profile</h2>
          <p className="text-xs text-warm-600">Tell the AI tutor about yourself so it can personalize conversations.</p>

          <div className="space-y-1">
            <label className="text-sm font-medium text-warm-700">Your Name</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g. Everitt"
              className="w-full bg-warm-50 border border-warm-300 rounded-lg px-3 py-2 text-sm text-warm-900 placeholder-warm-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-warm-700">About You</label>
            <textarea
              value={userContext}
              onChange={(e) => setUserContext(e.target.value)}
              placeholder="e.g. I'm preparing to study Chinese at the University of Sichuan"
              rows={3}
              className="w-full bg-warm-50 border border-warm-300 rounded-lg px-3 py-2 text-sm text-warm-900 placeholder-warm-400 resize-none focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"
            >
              Save
            </button>
            {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
          </div>
        </div>

        {/* Flashcard display mode */}
        <div className="bg-warm-100 rounded-2xl p-5 shadow-soft space-y-4">
          <h2 className="text-lg font-semibold text-warm-900">Flashcard Display</h2>
          <p className="text-xs text-warm-600">Choose what to show on the front of flashcards.</p>

          <div className="space-y-2">
            {[
              { id: 'characters_only', label: 'Characters Only', desc: 'Show 汉字, reveal pinyin + english' },
              { id: 'pinyin_only', label: 'Pinyin Only', desc: 'Show pīnyīn, reveal characters + english' },
              { id: 'both', label: 'Both', desc: 'Show characters + pinyin, reveal english' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleDisplayModeSelect(opt.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  pinyinDisplayMode === opt.id
                    ? 'bg-brand-50 border border-brand-300 ring-1 ring-brand-300'
                    : 'bg-warm-50 border border-warm-200 hover:border-warm-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-warm-900">{opt.label}</span>
                    <span className="text-xs text-warm-500 ml-2">{opt.desc}</span>
                  </div>
                  {pinyinDisplayMode === opt.id && (
                    <span className="text-brand-600 text-sm">&#10003;</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Voice preferences */}
        <div className="bg-warm-100 rounded-2xl p-5 shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-warm-900">Voice</h2>
            <button
              onClick={handlePreview}
              disabled={isSpeaking}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                isSpeaking
                  ? 'bg-warm-200 text-warm-400 cursor-not-allowed'
                  : 'bg-brand-600 hover:bg-brand-700 text-white'
              }`}
            >
              {isSpeaking ? 'Playing...' : 'Preview'}
            </button>
          </div>
          <p className="text-xs text-warm-600">Choose a voice for the AI tutor's speech.</p>

          <div className="space-y-2">
            {VOICE_OPTIONS.map((v) => (
              <button
                key={v.id}
                onClick={() => handleVoiceSelect(v.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  ttsVoice === v.id
                    ? 'bg-brand-50 border border-brand-300 ring-1 ring-brand-300'
                    : 'bg-warm-50 border border-warm-200 hover:border-warm-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-warm-900">{v.name}</span>
                    <span className="text-xs text-warm-500 ml-2">{v.desc}</span>
                  </div>
                  {ttsVoice === v.id && (
                    <span className="text-brand-600 text-sm">&#10003;</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Account */}
        <div className="bg-warm-100 rounded-2xl p-5 shadow-soft space-y-4">
          <h2 className="text-lg font-semibold text-warm-900">Account</h2>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-warm-600">Email</span>
              <span className="text-warm-900">{user?.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-warm-600">Credits</span>
              <span className="text-warm-900 font-medium">
                {credits != null ? `$${(credits / 1_000_000).toFixed(2)}` : '...'}
              </span>
            </div>
          </div>

          {/* Redeem promo code */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-warm-700">Redeem Promo Code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value); setPromoError(null); setPromoSuccess(false); }}
                placeholder="Enter code"
                className="flex-1 bg-warm-50 border border-warm-300 rounded-lg px-3 py-2 text-sm text-warm-900 placeholder-warm-400 focus:outline-none focus:ring-1 focus:ring-brand-500 uppercase"
              />
              <button
                onClick={async () => {
                  if (!promoCode.trim()) return;
                  setRedeeming(true);
                  setPromoError(null);
                  setPromoSuccess(false);
                  try {
                    const sb = getSupabaseClient();
                    const { data, error } = await sb.rpc('redeem_promo_code', {
                      p_code: promoCode.trim().toUpperCase(),
                      p_user_id: user.id,
                    });
                    if (error) throw error;
                    if (!data.success) {
                      setPromoError(data.error);
                    } else {
                      setPromoSuccess(true);
                      setPromoCode('');
                      await refreshCredits();
                    }
                  } catch (err) {
                    setPromoError(err.message);
                  } finally {
                    setRedeeming(false);
                  }
                }}
                disabled={redeeming || !promoCode.trim()}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"
              >
                {redeeming ? '...' : 'Redeem'}
              </button>
            </div>
            {promoError && <p className="text-red-600 text-xs">{promoError}</p>}
            {promoSuccess && <p className="text-green-600 text-xs">Code redeemed!</p>}
          </div>

          <button
            onClick={signOut}
            className="w-full bg-warm-200 hover:bg-warm-300 text-warm-700 text-sm font-medium py-2 rounded-lg cursor-pointer transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
