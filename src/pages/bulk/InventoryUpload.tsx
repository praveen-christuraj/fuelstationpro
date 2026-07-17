import EnterpriseUploadWizard from '../../components/EnterpriseUploadWizard';

export default function InventoryUpload() {
  return <EnterpriseUploadWizard title="Bulk Inventory Upload" description="Import stock movements (in/out) to adjust inventory levels" endpoint="/api/stock-movements" undoEndpoint="/api/stock-movements/undo" templateName="inventory" chunkSize={50} requestTimeoutMs={60000} fields={[
    { key: 'movement_date', label: 'Date', type: 'date', required: true, example: '2024-06-01' },
    { key: 'movement_type', label: 'Type (IN/OUT)', required: true, example: 'IN', options: ['IN', 'OUT'] },
    { key: 'tank_name', label: 'Tank', required: true, example: 'Tank T1' },
    { key: 'product_name', label: 'Product', required: true, example: 'Petrol (MS)' },
    { key: 'volume', label: 'Volume (L)', type: 'number', required: true, min: 0, example: '12000' },
    { key: 'reason', label: 'Reason', example: 'Tanker Receipt' },
  ]} />;
}
