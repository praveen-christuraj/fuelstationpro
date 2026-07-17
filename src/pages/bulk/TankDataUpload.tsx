import EnterpriseUploadWizard from '../../components/EnterpriseUploadWizard';

function validateTankRow(row: Record<string, string>, rowNumber: number): string[] {
  const errors: string[] = [];
  const capacity = row.capacity ? Number(row.capacity) : null;
  const currentVolume = row.current_volume ? Number(row.current_volume) : null;
  const deadStock = row.dead_stock ? Number(row.dead_stock) : null;
  const diameter = row.diameter ? Number(row.diameter) : null;

  if (currentVolume != null && capacity != null && currentVolume > capacity) {
    errors.push(`Current volume (${currentVolume}L) exceeds capacity (${capacity}L)`);
  }
  if (deadStock != null && deadStock < 0) {
    errors.push('Dead stock must be 0 or greater');
  }
  if (deadStock != null && capacity != null && deadStock >= capacity) {
    errors.push(`Dead stock (${deadStock}L) must be less than capacity (${capacity}L)`);
  }
  if (currentVolume != null && deadStock != null && currentVolume < deadStock) {
    errors.push(`Current volume (${currentVolume}L) is below dead stock level (${deadStock}L)`);
  }
  if (diameter != null && (diameter < 50 || diameter > 500)) {
    errors.push(`Diameter (${diameter}cm) seems unrealistic — must be between 50 and 500 cm`);
  }
  if (capacity != null && capacity <= 0) {
    errors.push('Capacity must be greater than 0');
  }
  return errors;
}

export default function TankDataUpload() {
  return <EnterpriseUploadWizard title="Bulk Tank Data Upload" description="Import tank master records & opening stock in bulk" endpoint="/api/tanks" templateName="tank_data" chunkSize={50} requestTimeoutMs={60000} fields={[
    { key: 'name', label: 'Tank Name', required: true, unique: true, example: 'Tank T1' },
    { key: 'code', label: 'Code', unique: true, example: 'T1' },
    { key: 'product_name', label: 'Product', required: true, example: 'Petrol (MS)' },
    { key: 'capacity', label: 'Capacity (L)', type: 'number', required: true, min: 0, example: '20000' },
    { key: 'current_volume', label: 'Current Volume (L)', type: 'number', min: 0, example: '12500' },
    { key: 'dead_stock', label: 'Dead Stock (L)', type: 'number', min: 0, example: '500' },
    { key: 'diameter', label: 'Diameter (cm)', type: 'number', min: 50, max: 500, example: '200' },
  ]} customValidate={validateTankRow} />;
}
