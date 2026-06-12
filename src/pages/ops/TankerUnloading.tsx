import MasterTable from '../../components/MasterTable';
import { fmtNum, fmtDate } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';

export default function TankerUnloading() {
  return <MasterTable endpoint="/api/tanker-unloading" entityName="Unloading" title="Tanker Unloading" subtitle="Record incoming fuel deliveries with declared vs received volume" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'unload_date', label: 'Date', type: 'date', required: true, render: (r) => fmtDate(r.unload_date) },
    { key: 'supplier_name', label: 'Supplier', type: 'select', required: true, optionsEndpoint: '/api/suppliers' },
    { key: 'tank_name', label: 'Tank', type: 'select', required: true, optionsEndpoint: '/api/tanks' },
    { key: 'product_name', label: 'Product', type: 'select', required: true, optionsEndpoint: '/api/products' },
    { key: 'invoice_no', label: 'Invoice / DC No.' },
    { key: 'declared_volume', label: 'Declared (L)', type: 'number', required: true, render: (r) => fmtNum(r.declared_volume, 0) },
    { key: 'received_volume', label: 'Received (L)', type: 'number', required: true, render: (r) => fmtNum(r.received_volume, 0) },
    { key: 'variance', label: 'Variance', hideInForm: true, render: (r) => { const v = Number(r.received_volume) - Number(r.declared_volume); return <Badge color={v < 0 ? 'red' : v > 0 ? 'green' : 'slate'}>{v >= 0 ? '+' : ''}{fmtNum(v, 1)} L</Badge>; } },
    { key: 'temperature', label: 'Temp (°C)', type: 'number' },
  ]} />;
}
