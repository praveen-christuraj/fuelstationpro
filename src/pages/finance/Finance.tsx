import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import MasterTable from '../../components/MasterTable';
import { Card } from '../../components/ui/Card';
import { apiGet, fmtMoney, fmtDate } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';

export default function Finance() {
  const [txns, setTxns] = useState<any[]>([]);
  useEffect(() => { apiGet('/api/finance').then(setTxns).catch(() => {}); }, []);
  const income = txns.filter((t) => t.txn_type === 'Income' || t.txn_type === 'Deposit').reduce((s, t) => s + Number(t.amount || 0), 0);
  const expense = txns.filter((t) => t.txn_type === 'Expense' || t.txn_type === 'Withdrawal').reduce((s, t) => s + Number(t.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><ArrowUpRight className="w-5 h-5 text-emerald-600" /></div><div><div className="text-xs text-slate-400">Total Income</div><div className="text-xl font-bold text-slate-800">{fmtMoney(income)}</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center"><ArrowDownRight className="w-5 h-5 text-rose-600" /></div><div><div className="text-xs text-slate-400">Total Expense</div><div className="text-xl font-bold text-slate-800">{fmtMoney(expense)}</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Wallet className="w-5 h-5 text-blue-600" /></div><div><div className="text-xs text-slate-400">Net Cashflow</div><div className="text-xl font-bold text-slate-800">{fmtMoney(income - expense)}</div></div></Card>
      </div>
      <MasterTable endpoint="/api/finance" entityName="Transaction" title="Finance Management" subtitle="Cash, bank deposits, expenses & reconciliation" columns={[
        { key: 'id', label: 'ID', hideInForm: true },
        { key: 'txn_date', label: 'Date', type: 'date', required: true, render: (r) => fmtDate(r.txn_date) },
        { key: 'txn_type', label: 'Type', type: 'select', required: true, options: [{ value: 'Income', label: 'Income' }, { value: 'Expense', label: 'Expense' }, { value: 'Deposit', label: 'Bank Deposit' }, { value: 'Withdrawal', label: 'Withdrawal' }], render: (r) => <Badge color={['Income', 'Deposit'].includes(r.txn_type) ? 'green' : 'red'}>{r.txn_type}</Badge> },
        { key: 'category', label: 'Category' },
        { key: 'bank_account', label: 'Bank Account' },
        { key: 'amount', label: 'Amount', type: 'number', required: true, render: (r) => fmtMoney(r.amount) },
        { key: 'reference', label: 'Reference / Note' },
      ]} />
    </div>
  );
}
