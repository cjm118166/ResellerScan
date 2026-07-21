"use client";
import { useState } from 'react';

export default function Home() {
  const [upc, setUpc] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upc) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/scan?upc=${upc}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700">
        <h1 className="text-2xl font-bold text-center mb-6 text-blue-400">ResellerScan</h1>
        
        <form onSubmit={handleScan} className="space-y-4">
          <input
            type="text"
            placeholder="Enter UPC Barcode"
            value={upc}
            onChange={(e) => setUpc(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500 transition"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-600/20"
          >
            {loading ? 'Searching...' : 'Scan Item'}
          </button>
        </form>

        {result && result.found && (
          <div className="mt-6 space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-700/50">
            <div className="flex items-center gap-3">
              {result.topMatch.image && (
                <img src={result.topMatch.image} alt="Product" className="w-16 h-16 object-contain bg-white rounded-lg p-1" />
              )}
              <p className="text-sm font-medium text-slate-300 line-clamp-2">{result.topMatch.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/50">
              <div className="bg-slate-950/60 p-3 rounded-lg">
                <span className="text-xs text-slate-400 block">Market Floor</span>
                <span className="text-lg font-bold text-emerald-400">${result.metrics.marketFloorPrice}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg">
                <span className="text-xs text-slate-400 block">Est. eBay Fee</span>
                <span className="text-lg font-bold text-rose-400">${result.metrics.estimatedEbayFee}</span>
              </div>
            </div>

            <div className="bg-blue-950/40 border border-blue-500/20 p-4 rounded-lg flex justify-between items-center">
              <div>
                <span className="text-xs text-blue-400 block font-semibold uppercase tracking-wider">Net Payout Estimate</span>
                <span className="text-2xl font-black text-white">${result.metrics.netPayoutEstimate}</span>
              </div>
              <span className="text-xs font-medium bg-slate-950/10 px-2 py-1 rounded border border-slate-950/10">
                13.25% + $0.30 Base
              </span>
            </div>

            <div className="pt-2">
              <a
                href={`https://www.ebay.com/sch/i.html?_nkw=${upc}&LH_Sold=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full block text-center bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-300 font-bold py-2.5 rounded-lg text-sm transition"
              >
                Deep-Dive Historical Sold Listings
              </a>
            </div>
          </div>
        )}

        {result && !result.found && (
          <div className="mt-6 bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-xl text-center text-sm"> 
            {result.message || result.error}
          </div>
        )}
      </div>
    </main>
  );
}
