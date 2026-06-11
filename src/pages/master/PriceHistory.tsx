import MasterTable from '../../components/MasterTable';
import { fmtMoney, fmtDate } from '../../lib/api';

export default function PriceHistory() {
  return <MasterTable endpoint="/api/price-history" entityName="Price Entry" title="Price History" subtitle="Track product price changes over time" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'product_name', label: 'Product', required: true },
    { key: 'old_price', label: 'Old Price', type: 'number', render: (r) => fmtMoney(r.old_price) },
    { key: 'new_price', label: 'New Price', type: 'number', required: true, render: (r) => fmtMoney(r.new_price) },
    { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, render: (r) => fmtDate(r.effective_date) },
    { key: 'changed_by', label: 'Changed By' },
  ]} />;
}
