import { useState } from 'react';
import useAuth from '../hooks/useAuth';
import { getSupabaseClient } from '../utils/supabase';

export default function PromoCodeScreen() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { user, refreshCredits, signOut } = useAuth();

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setError(null);
    setLoading(true);

    try {
      const sb = getSupabaseClient();
      const { data, error: rpcError } = await sb.rpc('redeem_promo_code', {
        p_code: code.trim().toUpperCase(),
        p_user_id: user.id,
      });

      if (rpcError) throw rpcError;

      if (!data.success) {
        setError(data.error);
      } else {
        await refreshCredits();
      }
    } catch (err) {
      setError(err.message || 'Failed to redeem code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-warm-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">🎟</div>
          <h2 className="text-xl font-bold text-warm-900">Enter Promo Code</h2>
          <p className="text-sm text-warm-600">
            Enter a promo code to get started with credits for conversations.
          </p>
        </div>

        <form onSubmit={handleRedeem} className="bg-warm-100 rounded-2xl p-5 shadow-soft space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-warm-700">Promo Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. BETA2024"
              className="w-full bg-warm-50 border border-warm-300 rounded-lg px-3 py-2 text-sm text-warm-900 placeholder-warm-400 focus:outline-none focus:ring-1 focus:ring-brand-500 uppercase"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors cursor-pointer"
          >
            {loading ? 'Redeeming...' : 'Redeem Code'}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={signOut}
            className="text-warm-500 hover:text-warm-700 text-sm cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
