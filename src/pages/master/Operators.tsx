import MasterTable from '../../components/MasterTable';
import { Badge } from '../../components/ui/Badge';

export default function Operators() {
  return <MasterTable endpoint="/api/operators" entityName="Operator" title="Operators" subtitle="Forecourt staff handling sales by shift" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'name', label: 'Full Name', required: true },
    { key: 'emp_code', label: 'Employee Code', required: true },
    { key: 'phone', label: 'Phone' },
    { key: 'role', label: 'Role', type: 'select', options: [{ value: 'Operator', label: 'Operator' }, { value: 'Supervisor', label: 'Supervisor' }, { value: 'Cashier', label: 'Cashier' }] },
    { key: 'active', label: 'Active', type: 'boolean', render: (r) => r.active ? <Badge color="green">Active</Badge> : <Badge color="slate">Inactive</Badge> },
  ]} />;
}
