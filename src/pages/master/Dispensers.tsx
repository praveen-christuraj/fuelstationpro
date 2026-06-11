import MasterTable from '../../components/MasterTable';
import { Badge } from '../../components/ui/Badge';

export default function Dispensers() {
  return <MasterTable endpoint="/api/dispensers" entityName="Dispenser" title="Dispensers" subtitle="Fuel dispensing units on the forecourt" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'name', label: 'Dispenser Name', required: true },
    { key: 'code', label: 'Code', required: true },
    { key: 'make', label: 'Make / Brand' },
    { key: 'num_nozzles', label: 'No. of Nozzles', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: 'Operational', label: 'Operational' }, { value: 'Maintenance', label: 'Maintenance' }, { value: 'Offline', label: 'Offline' }], render: (r) => <Badge color={r.status === 'Operational' ? 'green' : r.status === 'Maintenance' ? 'amber' : 'red'}>{r.status}</Badge> },
  ]} />;
}
