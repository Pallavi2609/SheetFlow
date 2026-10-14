import '@testing-library/jest-dom/vitest';

Element.prototype.scrollIntoView = () => {};

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:sheetflow-test';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}
