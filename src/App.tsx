import { useEffect, useState, useRef } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ContentWorkflow } from './components/workflow/ContentWorkflow';
import { useCampaignStore } from './stores';
import type { Phase } from './types';
import { Loader2, Plus, Trash2, FolderOpen, Download, Upload } from 'lucide-react';
import { exportAllData, importBackupData } from './lib/backup';

function CampaignSelector() {
  const { campaigns, currentCampaign, isLoading, loadCampaigns, createCampaign, selectCampaign, deleteCampaign } =
    useCampaignStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('Ved Kanalen Januar 2026');
  const [newPhase, setNewPhase] = useState<Phase>('TRANSITION_TEASE');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportAllData();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportMessage(null);
    try {
      const result = await importBackupData(file);
      setImportMessage(result.message);
      if (result.success) {
        await loadCampaigns();
      }
    } catch (err) {
      setImportMessage('Import failed');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createCampaign(newName.trim(), newPhase);
    setShowCreate(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (currentCampaign) {
    return null; // Campaign is selected, show workflow
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Vælg eller opret en kampagne
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Hver kampagne holder styr på billeder, analyser og genereret indhold
        </p>
      </div>

      {/* Existing campaigns */}
      {campaigns.length > 0 && (
        <div className="space-y-2">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
            >
              <button
                onClick={() => selectCampaign(campaign.id)}
                className="flex items-center gap-3 flex-1 text-left"
              >
                <FolderOpen className="w-5 h-5 text-gray-400" />
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{campaign.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Fase: {campaign.currentPhase} | Oprettet:{' '}
                    {new Date(campaign.createdAt).toLocaleDateString('da-DK')}
                  </p>
                </div>
              </button>
              <button
                onClick={() => {
                  if (confirm('Er du sikker? Dette sletter alle billeder og indhold.')) {
                    deleteCampaign(campaign.id);
                  }
                }}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Backup / Restore */}
      <div className="flex items-center justify-center gap-4 py-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleExport}
          disabled={isExporting || campaigns.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Eksporter backup
        </button>
        <label className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer">
          {isImporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Importer backup
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            disabled={isImporting}
          />
        </label>
      </div>
      {importMessage && (
        <p className="text-center text-sm text-green-600 dark:text-green-400">{importMessage}</p>
      )}

      {/* Create new campaign */}
      {showCreate ? (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
          <h3 className="font-medium text-gray-900 dark:text-white">Ny kampagne</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Navn
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="F.eks. Ved Kanalen Januar 2026"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start-fase
            </label>
            <select
              value={newPhase}
              onChange={(e) => setNewPhase(e.target.value as Phase)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="TRANSITION_TEASE">Fase 1: Transition & Tease</option>
              <option value="GETTING_READY">Fase 2: Getting Ready</option>
              <option value="LAUNCH">Fase 3: Launch</option>
              <option value="ESTABLISHMENT">Fase 4: Establishment</option>
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Annuller
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Opret kampagne
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Opret ny kampagne
        </button>
      )}
    </div>
  );
}

function AppContent() {
  const { currentCampaign } = useCampaignStore();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Ved Kanalen</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {currentCampaign ? currentCampaign.name : 'Content Calendar'}
            </p>
          </div>
          {currentCampaign && (
            <button
              onClick={() => useCampaignStore.setState({ currentCampaign: null })}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Skift kampagne
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {currentCampaign ? (
          <ContentWorkflow campaignId={currentCampaign.id} />
        ) : (
          <CampaignSelector />
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
