import BulkUploadWizard from '../../components/BulkUploadWizard';

export default function DipReadingsUpload() {
  return (
    <BulkUploadWizard
      title="Bulk Dip Readings Upload"
      description="Import dip readings in bulk. Volume will be computed from the tank calibration chart on the server."
      endpoint="/api/dip-readings"
      templateName="dip_readings"
      fields={[
        { key: 'reading_date', label: 'Reading Date', type: 'date', required: true, example: '2026-06-01' },
        { key: 'tank_name', label: 'Tank', required: true, example: 'Tank 1' },
        { key: 'reading_type', label: 'Reading Type', required: true, example: 'closing' },
        { key: 'dip_mm', label: 'Dip (mm)', type: 'number', required: true, example: '1250' },
      ]}
    />
  );
}

