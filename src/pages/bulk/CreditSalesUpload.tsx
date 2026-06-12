import BulkUploadWizard from '../../components/BulkUploadWizard';

export default function CreditSalesUpload() {
  return (
    <BulkUploadWizard
      title="Bulk Credit Sales Upload"
      description="Import credit sales records in bulk from a validated CSV template"
      endpoint="/api/credit-sales"
      templateName="credit_sales"
      fields={[
        { key: 'sale_date', label: 'Sale Date', type: 'date', required: true, example: '2026-06-01' },
        { key: 'customer_name', label: 'Customer', required: true, example: 'ABC Logistics' },
        { key: 'product_name', label: 'Product', required: true, example: 'Diesel (HSD)' },
        { key: 'volume', label: 'Volume (L)', type: 'number', required: true, example: '150' },
        { key: 'amount', label: 'Amount', type: 'number', required: true, example: '14500' },
        { key: 'vehicle_no', label: 'Vehicle No.', example: 'KA01AB1234' },
        { key: 'status', label: 'Status', required: true, example: 'Pending' },
      ]}
    />
  );
}

