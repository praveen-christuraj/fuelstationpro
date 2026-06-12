import MasterTable from '../../components/MasterTable';
import { Badge } from '../../components/ui/Badge';
import { fmtMoney } from '../../lib/api';

export default function Products() {
  return <MasterTable endpoint="/api/products" entityName="Product" title="Products" subtitle="Fuel & lubricant products sold at the station" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'name', label: 'Product Name', required: true },
    { key: 'code', label: 'Code' },
    { key: 'category', label: 'Category', type: 'select', options: [{ value: 'Fuel', label: 'Fuel' }, { value: 'Lubricant', label: 'Lubricant' }, { value: 'Additive', label: 'Additive' }], required: true },
    { key: 'unit', label: 'Unit', type: 'select', options: [{ value: 'Litre', label: 'Litre' }, { value: 'Unit', label: 'Unit' }] },
    { key: 'current_price', label: 'Unit Price', type: 'number', render: (r) => r.current_price ? fmtMoney(r.current_price) : '—' },
    { key: 'density', label: 'Density (kg/L)', type: 'number' },
    { key: 'active', label: 'Active', type: 'boolean', render: (r) => r.active ? <Badge color="green">Active</Badge> : <Badge color="slate">Inactive</Badge> },
  ]} />;
}
