import EnterpriseUploadWizard from '../../components/EnterpriseUploadWizard';

export default function PriceHistoryUpload() {
  return (
    <EnterpriseUploadWizard
      title="Bulk Price History Upload"
      description="Import historical price changes in bulk. Each row creates a price_history record that the system uses to compute correct sales amounts for back-dated entries."
      endpoint="/api/price-history"
      templateName="price_history"
      chunkSize={50}
      requestTimeoutMs={60000}
      fields={[
        { key: 'product_name', label: 'Product', required: true, example: 'Petrol (MS)' },
        { key: 'new_price', label: 'New Price', type: 'number', required: true, example: '103.50' },
        { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, example: '2026-06-01' },
        { key: 'changed_by', label: 'Changed By', example: 'Ramesh Kumar' },
        { key: 'remarks', label: 'Remarks', example: 'Monthly price revision' },
      ]}
    />
  );
}
