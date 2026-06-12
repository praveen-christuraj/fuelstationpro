import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet, Plus, ArrowRightLeft } from 'lucide-react';
import MasterTable from '../../components/MasterTable';
import { Card } from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { Field, Input, Select } from '../../components/ui/Field';
import { apiGet, apiPost, fmtMoney, fmtDate, fmtNum } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';

export default function Finance() {
  const [txns, setTxns] = useState<any[]>([]);
  const [salesEntries, setSalesEntries] = useState<any[]>([]);
  const [cashDeposits, setCashDeposits] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bufferTanks, setBufferTanks] = useState<any[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);

  const [loadError, setLoadError] = useState('');
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositErr, setDepositErr] = useState('');
  const [depositSaving, setDepositSaving] = useState(false);
  const [depositForm, setDepositForm] = useState<any>({ deposit_date: new Date().toISOString().slice(0, 10), bank_account_id: '', amount: '', reference: '' });

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferErr, setTransferErr] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferForm, setTransferForm] = useState<any>({ product_name: '', tank_name: '', volume: '' });

  const load = async () => {
    try {
      const [t, s, d, b, buf, tankRows] = await Promise.all([
        apiGet('/api/finance'),
        apiGet('/api/daily-sales'),
        apiGet('/api/cash-deposits'),
        apiGet('/api/bank-accounts'),
        apiGet('/api/buffer-tanks'),
        apiGet('/api/tanks'),
      ]);
      setTxns(t || []);
      setSalesEntries(s || []);
      setCashDeposits(d || []);
      setBankAccounts(b || []);
      setBufferTanks(buf || []);
      setTanks(tankRows || []);
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load data');
    }
  };

  useEffect(() => { load(); }, []);
  const income = txns.filter((t) => t.txn_type === 'Income' || t.txn_type === 'Deposit').reduce((s, t) => s + Number(t.amount || 0), 0);
  const expense = txns.filter((t) => t.txn_type === 'Expense' || t.txn_type === 'Withdrawal').reduce((s, t) => s + Number(t.amount || 0), 0);

  const salesTotals = useMemo(() => {
    const totalSales = salesEntries.reduce((s, e) => s + Number(e.total_sales_amount || 0), 0);
    const cash = salesEntries.reduce((s, e) => s + Number(e.cash_amount || 0), 0);
    const online = salesEntries.reduce((s, e) => s + Number(e.online_amount || 0), 0);
    const credit = salesEntries.reduce((s, e) => s + Number(e.credit_amount || 0), 0);
    const submitted = salesEntries.reduce((s, e) => s + Number(e.total_submitted || 0), 0);
    const variance = salesEntries.reduce((s, e) => s + Number(e.variance || 0), 0);
    const deposited = cashDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
    const cashInHand = cash - deposited;
    return { totalSales, cash, online, credit, submitted, variance, deposited, cashInHand };
  }, [salesEntries, cashDeposits]);

  const openDeposit = () => {
    setDepositForm({ deposit_date: new Date().toISOString().slice(0, 10), bank_account_id: '', amount: '', reference: '' });
    setDepositErr('');
    setShowDeposit(true);
  };

  const saveDeposit = async () => {
    setDepositErr('');
    if (!depositForm.deposit_date || depositForm.amount === '') {
      setDepositErr('Deposit date and amount are required');
      return;
    }
    setDepositSaving(true);
    try {
      const bank = bankAccounts.find((b) => String(b.id) === String(depositForm.bank_account_id));
      await apiPost('/api/cash-deposits', {
        deposit_date: depositForm.deposit_date,
        bank_account_id: depositForm.bank_account_id === '' ? null : Number(depositForm.bank_account_id),
        amount: Number(depositForm.amount || 0),
        reference: depositForm.reference || null,
      });
      await apiPost('/api/finance', {
        txn_date: depositForm.deposit_date,
        txn_type: 'Deposit',
        category: 'Cash Deposit',
        bank_account: bank ? (bank.bank_name ?? bank.name ?? null) : null,
        amount: Number(depositForm.amount || 0),
        reference: depositForm.reference || null,
      });
      setShowDeposit(false);
      await load();
    } catch (e: any) {
      setDepositErr(e.message || 'Failed to record deposit');
    } finally {
      setDepositSaving(false);
    }
  };

  const openTransfer = () => {
    setTransferForm({ product_name: '', tank_name: '', volume: '' });
    setTransferErr('');
    setShowTransfer(true);
  };

  const saveTransfer = async () => {
    setTransferErr('');
    if (!transferForm.product_name || !transferForm.tank_name || transferForm.volume === '') {
      setTransferErr('Product, tank and volume are required');
      return;
    }
    setTransferSaving(true);
    try {
      await apiPost('/api/buffer-transfer', {
        product_name: transferForm.product_name,
        tank_name: transferForm.tank_name,
        volume: Number(transferForm.volume || 0),
      });
      setShowTransfer(false);
      await load();
    } catch (e: any) {
      setTransferErr(e.message || 'Failed to transfer buffer');
    } finally {
      setTransferSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {loadError && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm">{loadError} <button onClick={() => { setLoadError(''); load(); }} className="underline ml-2">Retry</button></div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><ArrowUpRight className="w-5 h-5 text-emerald-600" /></div><div><div className="text-xs text-slate-400">Total Income</div><div className="text-xl font-bold text-slate-800">{fmtMoney(income)}</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center"><ArrowDownRight className="w-5 h-5 text-rose-600" /></div><div><div className="text-xs text-slate-400">Total Expense</div><div className="text-xl font-bold text-slate-800">{fmtMoney(expense)}</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Wallet className="w-5 h-5 text-blue-600" /></div><div><div className="text-xs text-slate-400">Net Cashflow</div><div className="text-xl font-bold text-slate-800">{fmtMoney(income - expense)}</div></div></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-xs text-slate-400">Total Sales (after testing)</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{fmtMoney(salesTotals.totalSales)}</div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
            <div><div className="text-xs text-slate-400">Cash</div><div className="font-semibold text-slate-700">{fmtMoney(salesTotals.cash)}</div></div>
            <div><div className="text-xs text-slate-400">Online</div><div className="font-semibold text-slate-700">{fmtMoney(salesTotals.online)}</div></div>
            <div><div className="text-xs text-slate-400">Credit</div><div className="font-semibold text-slate-700">{fmtMoney(salesTotals.credit)}</div></div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-slate-400">Cash In Hand (cash − deposits)</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{fmtMoney(salesTotals.cashInHand)}</div>
          <div className="text-sm text-slate-500 mt-2">Deposited: <span className="font-semibold text-slate-700">{fmtMoney(salesTotals.deposited)}</span></div>
          <div className="flex gap-2 mt-4">
            <button onClick={openDeposit} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"><Plus className="w-4 h-4" /> Record Deposit</button>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-slate-400">Sales vs Submitted Variance</div>
          <div className={`text-2xl font-bold mt-1 ${salesTotals.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{salesTotals.variance >= 0 ? '+' : ''}{fmtMoney(salesTotals.variance)}</div>
          <div className="text-sm text-slate-500 mt-2">Submitted: <span className="font-semibold text-slate-700">{fmtMoney(salesTotals.submitted)}</span></div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">Testing Buffer Tanks</div>
            <div className="text-xs text-slate-400 mt-0.5">Testing volumes accumulate by product and can be transferred into a tank</div>
          </div>
          <button onClick={openTransfer} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"><ArrowRightLeft className="w-4 h-4" /> Transfer Buffer</button>
        </div>
        <div className="overflow-x-auto mt-4 rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Buffer Volume (L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {bufferTanks.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2 text-slate-700">{b.product_name}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtNum(b.volume, 2)} L</td>
                </tr>
              ))}
              {bufferTanks.length === 0 && (
                <tr><td colSpan={2} className="px-3 py-8 text-center text-slate-400">No buffer volumes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <MasterTable endpoint="/api/finance" entityName="Transaction" title="Finance Management" subtitle="Cash, bank deposits, expenses & reconciliation" columns={[
        { key: 'id', label: 'ID', hideInForm: true },
        { key: 'txn_date', label: 'Date', type: 'date', required: true, render: (r) => fmtDate(r.txn_date) },
        { key: 'txn_type', label: 'Type', type: 'select', required: true, options: [{ value: 'Income', label: 'Income' }, { value: 'Expense', label: 'Expense' }, { value: 'Deposit', label: 'Bank Deposit' }, { value: 'Withdrawal', label: 'Withdrawal' }], render: (r) => <Badge color={['Income', 'Deposit'].includes(r.txn_type) ? 'green' : 'red'}>{r.txn_type}</Badge> },
        { key: 'category', label: 'Category' },
        { key: 'bank_account', label: 'Bank Account', type: 'select', optionsEndpoint: '/api/bank-accounts' },
        { key: 'amount', label: 'Amount', type: 'number', required: true, render: (r) => fmtMoney(r.amount) },
        { key: 'reference', label: 'Reference / Note' },
      ]} />

      <Modal open={showDeposit} onClose={() => setShowDeposit(false)} title="Record Cash Deposit">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Deposit Date" required>
              <Input type="date" value={depositForm.deposit_date} onChange={(e) => setDepositForm({ ...depositForm, deposit_date: e.target.value })} />
            </Field>
            <Field label="Bank Account">
              <Select value={depositForm.bank_account_id} onChange={(e) => setDepositForm({ ...depositForm, bank_account_id: e.target.value })}>
                <option value="">Select…</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bank_name ?? b.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount" required>
              <Input type="number" step="0.01" value={depositForm.amount} onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })} />
            </Field>
            <Field label="Reference">
              <Input value={depositForm.reference} onChange={(e) => setDepositForm({ ...depositForm, reference: e.target.value })} />
            </Field>
          </div>
          {depositErr && <p className="text-sm text-rose-600">{depositErr}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowDeposit(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={saveDeposit} disabled={depositSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">{depositSaving ? 'Saving…' : 'Save Deposit'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Testing Buffer to Tank">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Product" required>
              <Select value={transferForm.product_name} onChange={(e) => { setTransferForm({ ...transferForm, product_name: e.target.value, tank_name: '' }); }}>
                <option value="">Select…</option>
                {bufferTanks.map((b) => <option key={b.id} value={b.product_name}>{b.product_name} (Buffer {fmtNum(b.volume, 2)} L)</option>)}
              </Select>
            </Field>
            <Field label="Tank" required>
              <Select value={transferForm.tank_name} onChange={(e) => setTransferForm({ ...transferForm, tank_name: e.target.value })}>
                <option value="">Select…</option>
                {tanks.filter((t) => !transferForm.product_name || t.product_name === transferForm.product_name).map((t) => (
                  <option key={t.id} value={t.name}>{t.name} ({t.product_name})</option>
                ))}
              </Select>
            </Field>
            <Field label="Volume (L)" required>
              <Input type="number" step="0.01" value={transferForm.volume} onChange={(e) => setTransferForm({ ...transferForm, volume: e.target.value })} />
            </Field>
          </div>
          {transferErr && <p className="text-sm text-rose-600">{transferErr}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowTransfer(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={saveTransfer} disabled={transferSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">{transferSaving ? 'Transferring…' : 'Transfer'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
