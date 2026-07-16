import EnterpriseUploadWizard from '../../components/EnterpriseUploadWizard';

export default function DailySalesUpload() {
  return (
    <EnterpriseUploadWizard
      title="Bulk Daily Sales Upload"
      description="Import grouped daily sales with dispenser-wise reconciliation. Rows are grouped by (sale_date, shift_name, operator_name, dispenser_name), and each row should represent one nozzle of the selected dispenser."
      endpoint="/api/daily-sales/import"
      undoEndpoint="/api/daily-sales/undo"
      templateName="daily_sales"
      fields={[
        { key: 'sale_date', label: 'Sale Date', type: 'date', required: true, example: '2026-06-01' },
        { key: 'shift_name', label: 'Shift', required: true, example: 'Morning' },
        { key: 'operator_name', label: 'Operator', required: true, example: 'Ramesh Kumar' },
        { key: 'dispenser_name', label: 'Dispenser', required: true, example: 'Dispenser 1' },
        { key: 'nozzle_name', label: 'Nozzle', required: true, example: 'Nozzle 1A' },
        { key: 'closing_reading', label: 'Closing Reading', type: 'number', required: true, example: '121350' },
        { key: 'testing_volume', label: 'Testing Volume', type: 'number', example: '5' },
        { key: 'testing_remarks', label: 'Testing Remarks', example: 'Density test' },
        { key: 'cash_amount', label: 'Cash Amount', type: 'number', example: '55000' },
        { key: 'online_amount', label: 'Online Amount', type: 'number', example: '12000' },
        { key: 'credit_amount', label: 'Credit Amount', type: 'number', example: '8000' },
      ]}
    />
  );
}