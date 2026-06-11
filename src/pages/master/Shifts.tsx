import MasterTable from '../../components/MasterTable';

export default function Shifts() {
  return <MasterTable endpoint="/api/shifts" entityName="Shift" title="Shifts" subtitle="Working shift definitions for sales attribution" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'name', label: 'Shift Name', required: true },
    { key: 'start_time', label: 'Start Time', required: true },
    { key: 'end_time', label: 'End Time', required: true },
    { key: 'description', label: 'Description' },
  ]} />;
}
