import React, { useState } from 'react';
import { SkeletonImporter } from '../engine/import/skeletonImporter';
import type { ImportResult } from '../engine/import/universalSkeleton';

interface SkeletonImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (result: ImportResult) => void;
}

export const SkeletonImportDialog: React.FC<SkeletonImportDialogProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const result = await SkeletonImporter.importFromFile(file);
      setImportResult(result);
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClipboardImport = async () => {
    setIsLoading(true);
    try {
      const result = await SkeletonImporter.importFromClipboard();
      setImportResult(result);
    } catch (error) {
      console.error('Clipboard import failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Import Skeleton</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Upload File</label>
            <input
              type="file"
              accept=".json,.csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleClipboardImport}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
            >
              Import from Clipboard
            </button>
          </div>

          {isLoading && <p className="text-blue-600">Importing...</p>}

          {importResult && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Import Results</h3>
              <div className="text-sm space-y-1">
                <p>Success: {importResult.success ? 'Yes' : 'No'}</p>
                <p>Bones Imported: {importResult.metadata.bonesImported}</p>
                <p>Bones Mapped: {importResult.metadata.bonesMapped}</p>
                <p>Bones Unmapped: {importResult.metadata.bonesUnmapped}</p>
              </div>

              {importResult.warnings.length > 0 && (
                <div className="mt-2">
                  <h4 className="font-medium text-yellow-600">Warnings:</h4>
                  <ul className="text-sm text-yellow-600 list-disc list-inside">
                    {importResult.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="mt-2">
                  <h4 className="font-medium text-red-600">Errors:</h4>
                  <ul className="text-sm text-red-600 list-disc list-inside">
                    {importResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex space-x-2">
                <button
                  onClick={() => importResult.success && onImport(importResult)}
                  disabled={!importResult.success}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Apply Import
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
