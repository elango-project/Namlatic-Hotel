import '@testing-library/jest-dom';

if (typeof window !== 'undefined') {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = (file) => `blob:http://localhost:5173/${file?.name || 'mock-blob-url'}`;
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = () => {};
  }
}
