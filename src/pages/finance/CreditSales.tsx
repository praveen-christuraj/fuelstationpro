import MasterTable from '../../components/MasterTable';
import { fmtMoney, fmtDate } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';

export default function CreditSales() {
  return <MasterTable endpoint="/api/credit-sales" entityName="Credit Sale" title="Credit Sales" subtitle="Fuel sold on credit to corporate & fleet customers" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'sale_date', label: 'Date', type: 'date', required: true, render: (r) => fmtDate(r.sale_date) },
    { key: 'customer_name', label: 'Customer', required: true },
    { key: 'product_name', label: 'Product', type: 'select', required: true, optionsEndpoint: '/api/products' },
    { key: 'volume', label: 'Volume (L)', type: 'number', required: true },
    { key: 'amount', label: 'Amount', type: 'number', required: true, render: (r) => fmtMoney(r.amount) },
    { key: 'vehicle_no', label: 'Vehicle No.' },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: 'Pending', label: 'Pending' }, { value: 'Partial', label: 'Partial' }, { value: 'Paid', label: 'Paid' }], render: (r) => <Badge color={r.status === 'Paid' ? 'green' : r.status === 'Partial' ? 'amber' : 'red'}>{r.status}</Badge> },
  ]} />;
}
