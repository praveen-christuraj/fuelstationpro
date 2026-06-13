import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Loading, ErrorState } from '../../components/ui/States';
import { Badge } from '../../components/ui/Badge';
import { apiGet, apiPost, fmtMoney, fmtDate, fmtNum } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

export default function PriceHistory() {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [form, setForm] = useState({
    product_name: '',
    effective_date: new Date().toISOString().slice(0, 10),
    new_price: '',
    remarks: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [productRows, historyRows] = await Promise.all([
        apiGet('/api/products'),
        apiGet('/api/price-history'),
      ]);
      setProducts(productRows || []);
      setHistory(historyRows || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load price history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const byDate = String(b.effective_date || '').localeCompare(String(a.effective_date || ''));
      if (byDate !== 0) return byDate;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [history]);

  const currentPriceByProduct = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.name, Number(p.current_price || 0)));
    [...history]
      .filter((row) => String(row.effective_date || '') <= today)
      .sort((a, b) => {
        const byDate = String(a.effective_date || '').localeCompare(String(b.effective_date || ''));
        if (byDate !== 0) return byDate;
        return Number(a.id || 0) - Number(b.id || 0);
      })
      .forEach((row) => {
        map.set(String(row.product_name || ''), Number(row.new_price || 0));
      });
    return map;
  }, [products, history]);

  const latestActiveHistoryIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = new Map<string, number>();
    [...history]
      .filter((row) => String(row.effective_date || '') <= today)
      .sort((a, b) => {
        const byDate = String(a.effective_date || '').localeCompare(String(b.effective_date || ''));
        if (byDate !== 0) return byDate;
        return Number(a.id || 0) - Number(b.id || 0);
      })
      .forEach((row) => {
        map.set(String(row.product_name || ''), Number(row.id || 0));
      });
    return map;
  }, [history]);

  const resolvedOldPrice = useMemo(() => {
    if (!form.product_name || !form.effective_date) return 0;
    const applicable = [...history]
      .filter((row) => row.product_name === form.product_name && String(row.effective_date || '') <= form.effective_date)
      .sort((a, b) => {
        const byDate = String(b.effective_date || '').localeCompare(String(a.effective_date || ''));
        if (byDate !== 0) return byDate;
        return Number(b.id || 0) - Number(a.id || 0);
      });
    if (applicable.length > 0) return Number(applicable[0].new_price || 0);
    return Number(products.find((p) => p.name === form.product_name)?.current_price || 0);
  }, [form.product_name, form.effective_date, history, products]);

  const newPriceNumber = Number(form.new_price || 0);
  const inflationPct = resolvedOldPrice > 0 && Number.isFinite(newPriceNumber)
    ? ((newPriceNumber - resolvedOldPrice) / resolvedOldPrice) * 100
    : null;

  const openCreate = () => {
    setForm({
      product_name: '',
      effective_date: new Date().toISOString().slice(0, 10),
      new_price: '',
      remarks: '',
    });
    setFormErr('');
    setOpen(true);
  };

  const save = async () => {
    setFormErr('');
    if (!form.product_name || !form.effective_date || form.new_price === '') {
      setFormErr('Product, effective date and new price are required');
      return;
    }
    if (!Number.isFinite(Number(form.new_price)) || Number(form.new_price) < 0) {
      setFormErr('New price must be 0 or greater');
      return;
    }
    setSaving(true);
    try {
      await apiPost('/api/price-history', {
        product_name: form.product_name,
        effective_date: form.effective_date,
        new_price: Number(form.new_price),
        changed_by: user?.email || null,
        remarks: form.remarks || null,
      });
      setOpen(false);
      await load();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to update price');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Price History</h1>
          <p className="text-sm text-slate-400 mt-0.5">Update selling price only when it changes. The latest effective price carries forward automatically until the next update.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Update Price
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-xs text-slate-400">Products Priced</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{currentPriceByProduct.size}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-slate-400">Price Revisions</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{history.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-slate-400">Carry Forward Rule</div>
          <div className="text-sm font-medium text-slate-700 mt-2">Once updated, the price remains effective for calculations until the next effective-date update.</div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Current Effective Prices" subtitle="Latest active selling price by product" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3 text-right">Current Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-700">{product.name}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{fmtMoney(currentPriceByProduct.get(product.name) ?? 0)}</td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={2} className="px-5 py-10 text-center text-slate-400">No products configured</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Price Change History" subtitle="Old price is loaded automatically, and inflation is calculated from the previous price" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3 text-right">Old Price</th>
                <th className="px-5 py-3 text-right">New Price</th>
                <th className="px-5 py-3 text-right">Inflation</th>
                <th className="px-5 py-3">Effective Date</th>
                <th className="px-5 py-3">Remarks</th>
                <th className="px-5 py-3">Changed By</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedHistory.map((row) => {
                const oldPrice = Number(row.old_price || 0);
                const newPrice = Number(row.new_price || 0);
                const inflation = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : null;
                const isCurrent = latestActiveHistoryIds.get(String(row.product_name || '')) === Number(row.id || 0);
                const isFuture = String(row.effective_date || '') > new Date().toISOString().slice(0, 10);
                return (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-medium text-slate-700">{row.product_name}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{fmtMoney(oldPrice)}</td>
                    <td className="px-5 py-3 text-right text-slate-800 font-semibold">{fmtMoney(newPrice)}</td>
                    <td className="px-5 py-3 text-right">
                      {inflation == null ? '—' : <span className={inflation >= 0 ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>{inflation >= 0 ? '+' : ''}{fmtNum(inflation, 2)}%</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(row.effective_date)}</td>
                    <td className="px-5 py-3 text-slate-600">{row.remarks || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{row.changed_by || '—'}</td>
                    <td className="px-5 py-3">
                      {isFuture ? <Badge color="amber">Scheduled</Badge> : isCurrent ? <Badge color="green">Current</Badge> : <Badge color="slate">History</Badge>}
                    </td>
                  </tr>
                );
              })}
              {sortedHistory.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">No price changes recorded yet</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Update Product Price">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Product" required>
              <Select value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })}>
                <option value="">Select…</option>
                {products.map((product) => <option key={product.id} value={product.name}>{product.name}</option>)}
              </Select>
            </Field>
            <Field label="Effective Date" required>
              <Input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
            </Field>
            <Field label="Old Price">
              <Input value={resolvedOldPrice === 0 ? '' : String(resolvedOldPrice)} readOnly />
            </Field>
            <Field label="New Price" required>
              <Input type="number" min="0" step="0.01" value={form.new_price} onChange={(e) => setForm({ ...form, new_price: e.target.value })} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4 bg-slate-50 border-slate-100">
              <div className="text-xs text-slate-400">Price Inflation</div>
              <div className={`text-xl font-bold mt-1 ${inflationPct == null ? 'text-slate-400' : inflationPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {inflationPct == null ? '—' : `${inflationPct >= 0 ? '+' : ''}${fmtNum(inflationPct, 2)}%`}
              </div>
            </Card>
            <Card className="p-4 bg-blue-50 border-blue-100">
              <div className="text-xs text-blue-700">Carry Forward Preview</div>
              <div className="text-sm text-blue-800 mt-2">
                This price becomes effective from <span className="font-medium">{fmtDate(form.effective_date)}</span> and continues until the next price update for this product.
              </div>
            </Card>
          </div>

          <Field label="Remarks">
            <Textarea rows={3} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Reason for price change, revision note, company circular reference, etc." />
          </Field>

          {formErr && <p className="text-sm text-rose-600">{formErr}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save Price Update'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
