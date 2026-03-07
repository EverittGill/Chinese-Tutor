import { useState } from 'react';
import { getAzureConfig, setAzureConfig, getSupabaseConfig, setSupabaseConfig } from '../utils/config';

const REGIONS = [
  'eastus', 'eastus2', 'westus', 'westus2',
  'centralus', 'northeurope', 'westeurope', 'southeastasia'
];

export default function SetupScreen({ onComplete }) {
  const azureExisting = getAzureConfig();
  const supabaseExisting = getSupabaseConfig();

  const [azureKey, setAzureKey] = useState(azureExisting.key);
  const [azureRegion, setAzureRegion] = useState(azureExisting.region || REGIONS[0]);
  const [supabaseUrl, setSupabaseUrl] = useState(supabaseExisting.url);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(supabaseExisting.anonKey);

  function handleSave(e) {
    e.preventDefault();
    if (!azureKey.trim() || !supabaseUrl.trim() || !supabaseAnonKey.trim()) return;
    setAzureConfig(azureKey.trim(), azureRegion);
    setSupabaseConfig(supabaseUrl.trim(), supabaseAnonKey.trim());
    onComplete();
  }

  return (
    <div className="min-h-dvh bg-slate-900 flex items-center justify-center p-4">
      <form onSubmit={handleSave} className="bg-slate-800 rounded-2xl p-8 w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-50 mb-2">中文练习</h1>
          <p className="text-slate-400">Mandarin Conversation Trainer</p>
        </div>

        {/* Azure Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-teal-400 uppercase tracking-wider">Azure Speech Services</h2>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Speech Key</label>
            <input
              type="password"
              value={azureKey}
              onChange={e => setAzureKey(e.target.value)}
              placeholder="Enter your Azure Speech key"
              className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Region</label>
            <select
              value={azureRegion}
              onChange={e => setAzureRegion(e.target.value)}
              className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500"
            >
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* Supabase Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-teal-400 uppercase tracking-wider">Supabase</h2>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Project URL</label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={e => setSupabaseUrl(e.target.value)}
              placeholder="https://xxxxx.supabase.co"
              className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Anon Key</label>
            <input
              type="password"
              value={supabaseAnonKey}
              onChange={e => setSupabaseAnonKey(e.target.value)}
              placeholder="Enter your Supabase anon key"
              className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-500"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg py-3 transition-colors cursor-pointer"
        >
          Save & Start
        </button>
      </form>
    </div>
  );
}
