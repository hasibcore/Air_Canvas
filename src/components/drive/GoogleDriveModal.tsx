import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Upload,
  Download,
  Trash2,
  ExternalLink,
  RefreshCw,
  Folder,
  FileImage,
  FileCode,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  LogOut,
  Sparkles,
  Loader2,
  Cloud,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  googleLogout,
  getAccessToken,
  listDriveDrawings,
  saveDrawingToDrive,
  downloadFileFromDrive,
  deleteFileFromDrive,
  DriveFileItem,
} from '../../services/googleDriveService.ts';
import { DrawingEngine } from '../../services/drawingEngine.ts';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine: DrawingEngine;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  engine,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'save' | 'open'>('save');

  // Save State
  const [fileName, setFileName] = useState(() => `AirCanvas_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}`);
  const [fileFormat, setFileFormat] = useState<'png' | 'json'>('png');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<DriveFileItem | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Open/List State
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [fileListError, setFileListError] = useState<string | null>(null);

  // Deletion Confirmation Modal State (MANDATORY per Workspace Integration skill)
  const [fileToDelete, setFileToDelete] = useState<DriveFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Initialize Auth state listener
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        setAuthError(null);
      },
      () => {
        // User not logged in or token missing
        setUser(null);
        setToken(null);
      }
    );

    return () => unsubscribe();
  }, [isOpen]);

  const loadFiles = useCallback(async (authToken: string) => {
    setIsLoadingFiles(true);
    setFileListError(null);
    try {
      const files = await listDriveDrawings(authToken);
      setDriveFiles(files);
    } catch (err: unknown) {
      console.error(err);
      setFileListError(err instanceof Error ? err.message : 'Failed to retrieve drawings from Google Drive.');
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  // Fetch files when user is authenticated and on 'open' tab
  useEffect(() => {
    if (isOpen && token && activeTab === 'open') {
      loadFiles(token);
    }
  }, [isOpen, token, activeTab, loadFiles]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        if (activeTab === 'open') {
          loadFiles(res.accessToken);
        }
      }
    } catch (err: unknown) {
      console.error('Sign-in error:', err);
      setAuthError(err instanceof Error ? err.message : 'Google Drive authentication was cancelled or failed.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await googleLogout();
      setUser(null);
      setToken(null);
      setDriveFiles([]);
      setSaveSuccess(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveToDrive = async () => {
    if (!token) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      let blob: Blob;
      let finalName = fileName.trim() || `AirCanvas_${Date.now()}`;
      let mimeType = 'image/png';

      if (fileFormat === 'png') {
        finalName += finalName.endsWith('.png') ? '' : '.png';
        mimeType = 'image/png';
        const dataUrl = engine.exportAsImage(true);
        const res = await fetch(dataUrl);
        blob = await res.blob();
      } else {
        finalName += finalName.endsWith('.json') ? '' : '.json';
        mimeType = 'application/json';
        const projectData = engine.exportAsProjectData();
        const jsonStr = JSON.stringify(projectData, null, 2);
        blob = new Blob([jsonStr], { type: 'application/json' });
      }

      const uploaded = await saveDrawingToDrive(token, finalName, blob, mimeType);
      setSaveSuccess(uploaded);

      // Refresh list if user navigates to open
      setDriveFiles((prev) => [uploaded, ...prev]);
    } catch (err: unknown) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save drawing to Google Drive.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadDrawing = async (file: DriveFileItem) => {
    if (!token) return;
    setLoadingFileId(file.id);
    try {
      const blob = await downloadFileFromDrive(token, file.id);

      if (file.name.endsWith('.json') || file.mimeType.includes('json')) {
        const text = await blob.text();
        const json = JSON.parse(text);
        engine.loadProjectData(json);
      } else {
        // PNG or other image format
        const imgUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          engine.renderBackgroundImage(img);
          URL.revokeObjectURL(imgUrl);
        };
        img.src = imgUrl;
      }

      onClose();
    } catch (err: unknown) {
      console.error(err);
      alert('Error loading drawing: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoadingFileId(null);
    }
  };

  // Perform deletion after user confirmed in custom dialog
  const handleConfirmDelete = async () => {
    if (!token || !fileToDelete) return;
    setIsDeleting(true);
    try {
      await deleteFileFromDrive(token, fileToDelete.id);
      setDriveFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
      setFileToDelete(null);
    } catch (err: unknown) {
      console.error(err);
      alert('Failed to delete file: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-cyan-500/30 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center border border-cyan-500/30 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
              <HardDrive className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">Google Drive Cloud Storage</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  v2.0.0 Sync
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Save, backup, and restore drawings directly with your Google Drive
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Banner or User Profile Bar */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-2">
          {user ? (
            <>
              <div className="flex items-center gap-2.5">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-7 h-7 rounded-full border border-cyan-400/40 object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-cyan-600 text-white font-bold flex items-center justify-center text-xs">
                    {user.email ? user.email[0].toUpperCase() : 'G'}
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold text-white leading-tight">
                    {user.displayName || 'Google Drive Connected'}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-none">
                    {user.email}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-2.5 py-1 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 py-1">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Sign in with Google to backup drawings in your personal Drive</span>
              </div>

              {/* Official Google Sign-In Button */}
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isAuthLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-700" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Sign in with Google</span>
              </button>
            </div>
          )}
        </div>

        {authError && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {/* Tab Selector */}
        <div className="px-5 pt-3 flex gap-2 border-b border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('save')}
            className={`pb-2.5 px-3 font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'save'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Save to Google Drive</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('open')}
            className={`pb-2.5 px-3 font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'open'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Open from Google Drive</span>
            {driveFiles.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-cyan-300 text-[10px] font-mono">
                {driveFiles.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto text-xs space-y-4">
          {!user ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center mx-auto">
                <Cloud className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="font-bold text-white text-sm">Connect with Google Drive</h4>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Authenticate with your Google account to automatically backup sketches, export high-res artwork, or load drawing projects from any device.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold rounded-xl shadow-lg transition-all active:scale-95 inline-flex items-center gap-2"
              >
                {isAuthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                <span>Sign in with Google</span>
              </button>
            </div>
          ) : activeTab === 'save' ? (
            /* SAVE DRAWING TAB */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold text-xs">
                  Drawing Title:
                </label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="e.g. My Sketch"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold text-xs">
                  Format:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFileFormat('png')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      fileFormat === 'png'
                        ? 'bg-cyan-500/15 border-cyan-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs mb-0.5">
                      <FileImage className="w-4 h-4 text-cyan-400" />
                      <span>PNG Image (.png)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      High-resolution visual snapshot ready to view or share
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFileFormat('json')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      fileFormat === 'json'
                        ? 'bg-cyan-500/15 border-cyan-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs mb-0.5">
                      <FileCode className="w-4 h-4 text-teal-400" />
                      <span>AirCanvas Project (.json)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Full vector strokes, pressure, and working area to reopen & edit
                    </p>
                  </button>
                </div>
              </div>

              {/* Destination folder note */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-2.5 text-slate-400 text-[11px]">
                <Folder className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  Saves directly into the <strong className="text-slate-200">Air Canvas Drawings</strong> folder in your Google Drive.
                </span>
              </div>

              {saveError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Drawing successfully saved to Google Drive!</span>
                  </div>
                  {saveSuccess.webViewLink && (
                    <a
                      href={saveSuccess.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 underline font-semibold text-[11px]"
                    >
                      <span>Open in Google Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveToDrive}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving to Google Drive...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload & Save Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* OPEN DRAWING TAB */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold text-xs">
                  Saved Drawings in Google Drive:
                </span>
                <button
                  type="button"
                  onClick={() => token && loadFiles(token)}
                  disabled={isLoadingFiles}
                  className="text-cyan-400 hover:text-cyan-300 text-xs flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {fileListError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fileListError}</span>
                </div>
              )}

              {isLoadingFiles ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mx-auto" />
                  <p className="text-xs">Connecting to Google Drive...</p>
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="py-10 text-center text-slate-500 space-y-2 bg-slate-950/40 border border-slate-800 rounded-2xl">
                  <Folder className="w-8 h-8 mx-auto opacity-50" />
                  <p className="text-xs">No drawings found in your "Air Canvas Drawings" folder.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('save')}
                    className="text-cyan-400 underline font-semibold text-xs"
                  >
                    Save your first drawing now
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                  {driveFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-3 rounded-2xl bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                          {file.name.endsWith('.json') ? (
                            <FileCode className="w-4 h-4 text-teal-400" />
                          ) : (
                            <FileImage className="w-4 h-4 text-cyan-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-bold truncate text-xs">
                            {file.name}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2">
                            <span>
                              {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Recent'}
                            </span>
                            {file.size && (
                              <span>• {(parseInt(file.size, 10) / 1024).toFixed(0)} KB</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadDrawing(file)}
                          disabled={loadingFileId === file.id}
                          className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs flex items-center gap-1 transition-colors"
                        >
                          {loadingFileId === file.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>Load</span>
                        </button>

                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                            title="Open in Google Drive"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => setFileToDelete(file)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                          title="Delete file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MANDATORY USER CONFIRMATION MODAL FOR DESTRUCTIVE OPERATIONS */}
      {fileToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-sm">Delete File from Drive?</h4>
            </div>

            <p className="text-slate-300 text-xs leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-white font-mono">{fileToDelete.name}</strong> from your Google Drive? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
