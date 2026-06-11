import MasterTable from '../../components/MasterTable';

export default function Suppliers() {
  return <MasterTable endpoint="/api/suppliers" entityName="Supplier" title="Suppliers" subtitle="Fuel suppliers & oil marketing companies" columns={[
    { key: 'id', label: 'ID', hideInForm: true },
    { key: 'name', label: 'Supplier Name', required: true },
    { key: 'contact_person', label: 'Contact Person' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'gst_no', label: 'GST / Tax No.' },
    { key: 'products', label: 'Products Supplied' },
  ]} />;
}
