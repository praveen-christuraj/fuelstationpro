import MasterTable from '../../components/MasterTable';
import { Badge } from '../../components/ui/Badge';

export default function Nozzles() {
  return <MasterTable endpoint="/api/nozzles" entityName="Nozzle" title="Nozzles" subtitle="Individual nozzles mapped to dispensers, tanks & products" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'name', label: 'Nozzle Name', required: true },
    { key: 'dispenser_name', label: 'Dispenser', required: true },
    { key: 'tank_name', label: 'Connected Tank', required: true },
    { key: 'product_name', label: 'Product', required: true },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }], render: (r) => <Badge color={r.status === 'Active' ? 'green' : 'slate'}>{r.status}</Badge> },
  ]} />;
}
