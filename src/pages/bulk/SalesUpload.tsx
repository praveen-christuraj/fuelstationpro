import BulkUploadWizard from '../../components/BulkUploadWizard';

export default function SalesUpload() {
  return <BulkUploadWizard title="Bulk Sales Upload" description="Import daily sales records in bulk from a validated CSV template" endpoint="/api/sales" templateName="sales" fields={[
    { key: 'sale_date', label: 'Sale Date', type: 'date', required: true, example: '2024-06-01' },
    { key: 'nozzle_name', label: 'Nozzle', example: 'Nozzle 1A' },
    { key: 'product_name', label: 'Product', required: true, example: 'Petrol (MS)' },
    { key: 'operator_name', label: 'Operator', required: true, example: 'Ramesh Kumar' },
    { key: 'shift_name', label: 'Shift', required: true, example: 'Morning' },
    { key: 'opening_reading', label: 'Opening Reading', type: 'number', required: true, example: '120500' },
    { key: 'closing_reading', label: 'Closing Reading', type: 'number', required: true, example: '121350' },
    { key: 'testing_volume', label: 'Testing Volume', type: 'number', example: '5' },
    { key: 'sale_volume', label: 'Sale Volume', type: 'number', example: '845' },
    { key: 'unit_price', label: 'Unit Price', type: 'number', required: true, example: '102.50' },
    { key: 'total_amount', label: 'Total Amount', type: 'number', example: '86612.50' },
  ]} />;
}
