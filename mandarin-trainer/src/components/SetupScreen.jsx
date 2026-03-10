import { markSetupComplete } from '../utils/config';

export default function SetupScreen({ onComplete }) {
  function handleStart() {
    markSetupComplete();
    onComplete();
  }

  return (
    <div className="min-h-dvh bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-md space-y-6 text-center">
        <div>
          <h1 className="text-4xl font-bold text-slate-50 mb-2">中文练习</h1>
          <p className="text-slate-400">Mandarin Conversation Trainer</p>
        </div>

        <p className="text-sm text-slate-400">
          Practice Mandarin conversation with an AI partner. Speak Chinese, get corrections, and build vocabulary.
        </p>

        <button
          onClick={handleStart}
          className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg py-3 transition-colors cursor-pointer"
        >
          Start Practicing
        </button>
      </div>
    </div>
  );
}
