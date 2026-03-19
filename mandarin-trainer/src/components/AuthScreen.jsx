import { useState } from 'react';
import useAuth from '../hooks/useAuth';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const data = await signUp(email.trim(), password);
        // If email confirmation is required, user won't be auto-logged in
        if (data.user && !data.session) {
          setConfirmationSent(true);
        }
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (confirmationSent) {
    return (
      <div className="min-h-dvh bg-warm-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-warm-100 rounded-2xl p-6 shadow-soft text-center space-y-4">
          <div className="text-4xl">📧</div>
          <h2 className="text-xl font-bold text-warm-900">Check your email</h2>
          <p className="text-sm text-warm-600">
            We sent a confirmation link to <span className="font-medium text-warm-800">{email}</span>.
            Click the link to verify your account, then come back and sign in.
          </p>
          <button
            onClick={() => {
              setConfirmationSent(false);
              setMode('signin');
              setPassword('');
            }}
            className="text-brand-600 hover:text-brand-700 text-sm font-medium cursor-pointer"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-warm-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-6">
        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-warm-900">中文练习</h1>
          <p className="text-sm text-warm-600">Mandarin Conversation Trainer</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-warm-200 rounded-xl p-1">
          <button
            onClick={() => { setMode('signin'); setError(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              mode === 'signin'
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('signup'); setError(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-warm-100 rounded-2xl p-5 shadow-soft space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-warm-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-warm-50 border border-warm-300 rounded-lg px-3 py-2 text-sm text-warm-900 placeholder-warm-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-warm-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-warm-50 border border-warm-300 rounded-lg px-3 py-2 text-sm text-warm-900 placeholder-warm-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors cursor-pointer"
          >
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
