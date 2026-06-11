import MasterTable from '../../components/MasterTable';
import { fmtNum } from '../../lib/api';

export default function Meters() {
  return <MasterTable endpoint="/api/meters" entityName="Meter" title="Meters" subtitle="Cumulative totalizer meters per nozzle" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'nozzle_name', label: 'Nozzle', required: true },
    { key: 'serial_no', label: 'Serial No.', required: true },
    { key: 'opening_reading', label: 'Opening Reading', type: 'number', render: (r) => fmtNum(r.opening_reading, 2) },
    { key: 'current_reading', label: 'Current Reading', type: 'number', render: (r) => fmtNum(r.current_reading, 2) },
    { key: 'unit', label: 'Unit', type: 'select', options: [{ value: 'Litre', label: 'Litre' }] },
  ]} />;
}
