import { useState } from 'react';
import useAuth from '../hooks/useAuth';
import { getSupabaseClient } from '../utils/supabase';

export default function CreditModal({ onDismiss }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { user, refreshCredits, setCreditError } = useAuth();

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
        setCreditError(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to redeem code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="max-w-sm w-full bg-warm-50 rounded-2xl shadow-lg p-6 space-y-5">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-bold text-warm-900">Out of Credits</h2>
          <p className="text-sm text-warm-600">
            Your balance is $0.00. Enter a promo code to continue.
          </p>
        </div>

        <form onSubmit={handleRedeem} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-warm-700">Promo Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. BETA2024"
              className="w-full bg-warm-100 border border-warm-300 rounded-lg px-3 py-2 text-sm text-warm-900 placeholder-warm-400 focus:outline-none focus:ring-1 focus:ring-brand-500 uppercase"
              autoFocus
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

        <button
          onClick={onDismiss}
          className="w-full text-warm-500 hover:text-warm-700 text-sm cursor-pointer"
        >
          Back to Topics
        </button>
      </div>
    </div>
  );
}
