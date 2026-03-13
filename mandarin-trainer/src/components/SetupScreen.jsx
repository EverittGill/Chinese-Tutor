import { markSetupComplete } from '../utils/config';

export default function SetupScreen({ onComplete }) {
  function handleStart() {
    markSetupComplete();
    onComplete();
  }

  return (
    <div className="min-h-dvh bg-warm-50 flex items-center justify-center p-4">
      <div className="bg-warm-100 rounded-2xl p-8 w-full max-w-md space-y-6 text-center shadow-soft">
        <div>
          <h1 className="text-4xl font-bold text-warm-900 mb-2">中文练习</h1>
          <p className="text-warm-600">Mandarin Conversation Trainer</p>
        </div>

        <p className="text-sm text-warm-600">
          Practice Mandarin conversation with an AI partner. Speak Chinese, get corrections, and build vocabulary.
        </p>

        <button
          onClick={handleStart}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg py-3 transition-colors cursor-pointer"
        >
          Start Practicing
        </button>
      </div>
    </div>
  );
}
