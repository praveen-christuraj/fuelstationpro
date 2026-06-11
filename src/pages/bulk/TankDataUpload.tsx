import BulkUploadWizard from '../../components/BulkUploadWizard';

export default function TankDataUpload() {
  return <BulkUploadWizard title="Bulk Tank Data Upload" description="Import tank master records & opening stock in bulk" endpoint="/api/tanks" templateName="tank_data" fields={[
    { key: 'name', label: 'Tank Name', required: true, example: 'Tank T1' },
    { key: 'code', label: 'Code', example: 'T1' },
    { key: 'product_name', label: 'Product', required: true, example: 'Petrol (MS)' },
    { key: 'capacity', label: 'Capacity (L)', type: 'number', required: true, example: '20000' },
    { key: 'current_volume', label: 'Current Volume (L)', type: 'number', example: '12500' },
    { key: 'dead_stock', label: 'Dead Stock (L)', type: 'number', example: '500' },
    { key: 'diameter', label: 'Diameter (cm)', type: 'number', example: '200' },
  ]} />;
}
