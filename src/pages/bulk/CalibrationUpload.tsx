import EnterpriseUploadWizard from '../../components/EnterpriseUploadWizard';

export default function CalibrationUpload() {
  return (
    <EnterpriseUploadWizard
      title="Bulk Tank Calibration Upload"
      description="Import calibration points in bulk. Points are grouped by tank_name, validated, then replaced for each tank."
      endpoint="/api/calibration/import"
      templateName="tank_calibration"
      chunkSize={20}
      requestTimeoutMs={60000}
      sortBeforeUpload={false}
      fields={[
        { key: 'tank_name', label: 'Tank', required: true, example: 'Tank 1' },
        { key: 'dip_mm', label: 'Dip (mm)', type: 'number', required: true, example: '1000' },
        { key: 'volume_liters', label: 'Volume (L)', type: 'number', required: true, example: '9500' },
      ]}
    />
  );
}
