import BulkUploadWizard from '../../components/BulkUploadWizard';

export default function PriceHistoryUpload() {
  return (
    <BulkUploadWizard
      title="Bulk Price History Upload"
      description="Import historical price changes in bulk. Each row creates a price_history record that the system uses to compute correct sales amounts for back-dated entries."
      endpoint="/api/price-history"
      templateName="price_history"
      fields={[
        { key: 'product_name', label: 'Product', required: true, example: 'Petrol (MS)' },
        { key: 'new_price', label: 'New Price', type: 'number', required: true, example: '103.50' },
        { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, example: '2026-06-01' },
      ]}
    />
  );
}
