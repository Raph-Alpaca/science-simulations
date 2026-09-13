import { productionInputs } from './content.mjs';
try {
  const result = await productionInputs();
  console.log(`VALID: metadata ${result.packages.length}, approved ${result.selected.length}. Empty catalog is expected without trusted approvals.`);
} catch (e) { console.error(`VALIDATION_FAILED: ${e.message}`); process.exitCode = 1; }
