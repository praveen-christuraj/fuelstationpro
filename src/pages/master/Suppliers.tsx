import MasterTable from '../../components/MasterTable';

export default function Suppliers() {
  return <MasterTable endpoint="/api/suppliers" entityName="Supplier" title="Suppliers" subtitle="Fuel suppliers & oil marketing companies" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'name', label: 'Supplier Name', required: true },
    { key: 'contact_person', label: 'Contact Person' },
    { key: 'phone', label: 'Phone', pattern: '^[+]?[\\d\\s-]{7,15}$', patternMessage: 'Invalid phone number' },
    { key: 'email', label: 'Email' },
    { key: 'gst_no', label: 'GST / Tax No.', pattern: '^\\d{2}[A-Z]{5}\\d{4}[A-Z]\\d[Z]\\d[A-Z\\d]$', patternMessage: 'Invalid GST format (e.g., 22AAAAA0000A1Z5)' },
    { key: 'products', label: 'Products Supplied' },
  ]} />;
}
