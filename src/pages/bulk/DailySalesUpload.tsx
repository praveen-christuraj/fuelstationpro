import EnterpriseUploadWizard from '../../components/EnterpriseUploadWizard';

function validateDailySalesRow(row: Record<string, string>, rowNumber: number): string[] {
  const errors: string[] = [];
  const tv = row.testing_volume ? Number(row.testing_volume) : 0;
  const nozzle = (row.nozzle_name || '').trim();

  if (tv > 0 && !nozzle) {
    errors.push('Testing volume requires a nozzle name');
  }

  return errors;
}

export default function DailySalesUpload() {
  return (
    <EnterpriseUploadWizard
      title="Bulk Daily Sales Upload"
      description="Import grouped daily sales with dispenser-wise reconciliation. Rows are grouped by (sale_date, shift_name, operator_name, dispenser_name), and each row should represent one nozzle of the selected dispenser."
      endpoint="/api/daily-sales/import"
      undoEndpoint="/api/daily-sales/undo"
      templateName="daily_sales"
      customValidate={validateDailySalesRow}
      chunkSize={20}
      requestTimeoutMs={60000}
      sortBeforeUpload={false}
      fields={[
        { key: 'sale_date', label: 'Sale Date', type: 'date', required: true, example: '2026-06-01' },
        { key: 'shift_name', label: 'Shift', required: true, example: 'Morning' },
        { key: 'operator_name', label: 'Operator', required: true, example: 'Ramesh Kumar' },
        { key: 'dispenser_name', label: 'Dispenser', required: true, example: 'Dispenser 1' },
        { key: 'nozzle_name', label: 'Nozzle', required: true, example: 'Nozzle 1A' },
        { key: 'opening_reading', label: 'Opening Reading', type: 'number', example: '121000' },
        { key: 'closing_reading', label: 'Closing Reading', type: 'number', required: true, min: 0, example: '121350' },
        { key: 'testing_volume', label: 'Testing Volume', type: 'number', example: '5' },
        { key: 'testing_remarks', label: 'Testing Remarks', example: 'Density test' },
        { key: 'cash_amount', label: 'Cash Amount', type: 'number', example: '55000' },
        { key: 'online_amount', label: 'Online Amount', type: 'number', example: '12000' },
        { key: 'credit_amount', label: 'Credit Amount', type: 'number', example: '8000' },
      ]}
    />
  );
}
