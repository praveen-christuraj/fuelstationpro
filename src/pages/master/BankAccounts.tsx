import MasterTable from '../../components/MasterTable';
import { fmtMoney } from '../../lib/api';

export default function BankAccounts() {
  return <MasterTable endpoint="/api/bank-accounts" entityName="Bank Account" title="Bank Accounts" subtitle="Accounts used for deposits & reconciliation" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'bank_name', label: 'Bank Name', required: true },
    { key: 'account_name', label: 'Account Name', required: true },
    { key: 'account_no', label: 'Account No.', required: true, minLength: 6 },
    { key: 'ifsc', label: 'IFSC / SWIFT', pattern: '^[A-Za-z]{4}0[A-Za-z0-9]{6}$', patternMessage: 'Invalid IFSC format (e.g., SBIN0001234)' },
    { key: 'balance', label: 'Balance', type: 'number', render: (r) => fmtMoney(r.balance) },
  ]} />;
}
