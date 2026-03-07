import { useState } from 'react';
import { getAzureConfig, setAzureConfig } from '../utils/config';

const REGIONS = [
  'eastus', 'eastus2', 'westus', 'westus2',
  'centralus', 'northeurope', 'westeurope', 'southeastasia'
];

export default function SetupScreen({ onComplete }) {
  const existing = getAzureConfig();
  const [key, setKey] = useState(existing.key);
  const [region, setRegion] = useState(existing.region || REGIONS[0]);

  function handleSave(e) {
    e.preventDefault();
    if (!key.trim()) return;
    setAzureConfig(key.trim(), region);
    onComplete();
  }

  return (
    <div className="min-h-dvh bg-slate-900 flex items-center justify-center p-4">
      <form onSubmit={handleSave} className="bg-slate-800 rounded-2xl p-8 w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-50 mb-2">中文练习</h1>
          <p className="text-slate-400">Mandarin Conversation Trainer</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Azure Speech Key</label>
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="Enter your Azure Speech key"
              className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Azure Region</label>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              className="w-full bg-slate-700 text-slate-50 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500"
            >
              {REGIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
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
