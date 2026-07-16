import EnterpriseUploadWizard from '../../components/EnterpriseUploadWizard';

export default function TankerUnloadingUpload() {
  return (
    <EnterpriseUploadWizard
      title="Bulk Tanker Unloading Upload"
      description="Import tanker unloading records in bulk. Rows are grouped by (unload_date, tanker_number) — each row represents one compartment. Volume &amp; variance are computed from calibration charts on the server."
      endpoint="/api/tanker-unloading/import"
      undoEndpoint="/api/tanker-unloading/undo"
      templateName="tanker_unloading"
      fields={[
        { key: 'unload_date', label: 'Unload Date', type: 'date', required: true, example: '2026-06-13' },
        { key: 'tanker_number', label: 'Tanker Number', required: true, example: 'KA01AB1234' },
        { key: 'supplier_name', label: 'Supplier', example: 'IOCL' },
        { key: 'waybill_no', label: 'Waybill No', example: 'WB-2026-001' },
        { key: 'invoice_no', label: 'Invoice No', example: 'INV-001' },
        { key: 'temperature', label: 'Temp (°C)', type: 'number', example: '32.5' },
        { key: 'product_name', label: 'Product', required: true, example: 'Diesel (HSD)' },
        { key: 'tank_name', label: 'Tank', required: true, example: 'Tank 1' },
        { key: 'tanker_qty', label: 'Tanker Qty (L)', type: 'number', required: true, min: 0, example: '12000' },
        { key: 'dip_before_mm', label: 'Dip Before (mm)', type: 'number', required: true, min: 0, example: '500' },
        { key: 'dip_after_mm', label: 'Dip After (mm)', type: 'number', required: true, min: 0, example: '1850' },
      ]}
    />
  );
}
