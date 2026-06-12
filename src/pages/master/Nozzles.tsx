import MasterTable from '../../components/MasterTable';
import { Badge } from '../../components/ui/Badge';

export default function Nozzles() {
  return <MasterTable endpoint="/api/nozzles" entityName="Nozzle" title="Nozzles" subtitle="Individual nozzles mapped to dispensers, tanks & products" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'name', label: 'Nozzle Name', required: true },
    { key: 'code', label: 'Code' },
    { key: 'dispenser_name', label: 'Dispenser', type: 'select', required: true, optionsEndpoint: '/api/dispensers' },
    { key: 'product_name', label: 'Product', type: 'select', required: true, optionsEndpoint: '/api/products' },
    { key: 'tank_name', label: 'Connected Tank', type: 'select', required: true, optionsEndpoint: '/api/tanks' },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }], render: (r) => <Badge color={r.status === 'Active' ? 'green' : 'slate'}>{r.status}</Badge> },
  ]} />;
}
