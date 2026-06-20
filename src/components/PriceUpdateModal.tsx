import { useEffect, useState } from 'react';
import { X, Save, SkipForward } from 'lucide-react';
import { apiGet, apiPost, fmtMoney } from '../lib/api';
import { Card } from './ui/Card';

interface ProductPrice {
  name: string;
  current_price: number;
  new_price: string;
}

export default function PriceUpdateModal({ onClose }: { onClose: () => void }) {
  const [products, setProducts] = useState<ProductPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<any[]>('/api/products')
      .then((data) => {
        setProducts((data || []).map((p) => ({
          name: p.name,
          current_price: Number(p.current_price || 0),
          new_price: String(p.current_price ?? ''),
        })));
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || 'Failed to load products');
        setLoading(false);
      });
  }, []);

  const updatePrice = (name: string, value: string) => {
    setProducts((prev) => prev.map((p) => (p.name === name ? { ...p, new_price: value } : p)));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const records = products.map((p) => ({
      product_name: p.name,
      new_price: Number(p.new_price) || 0,
      effective_date: today,
    }));
    try {
      await apiPost('/api/price-history', records);
      localStorage.setItem('lastPriceUpdateDate', today);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save prices');
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    localStorage.setItem('lastPriceUpdateDate', new Date().toISOString().slice(0, 10));
    onClose();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Card className="p-6 w-full max-w-lg"><p className="text-sm text-slate-500">Loading products...</p></Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Daily Price Update</h2>
          <button onClick={skip} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Review and confirm today's prices for all products.</p>

        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 mb-4 text-sm text-rose-700">{error}</div>}

        <div className="overflow-y-auto flex-1 space-y-3">
          {products.map((p) => (
            <div key={p.name} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                <p className="text-xs text-slate-400">Last: {fmtMoney(p.current_price)}</p>
              </div>
              <input
                type="number"
                step="0.01"
                value={p.new_price}
                onChange={(e) => updatePrice(p.name, e.target.value)}
                className="w-32 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-right font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
          <button onClick={skip} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
            <SkipForward className="w-4 h-4" /> Skip for Today
          </button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Prices'}
          </button>
        </div>
      </Card>
    </div>
  );
}
