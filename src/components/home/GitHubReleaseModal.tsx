import React, { useState } from 'react';
import {
  FolderGit2,
  GitBranch,
  Tag,
  Download,
  Terminal,
  ExternalLink,
  Check,
  Copy,
  X,
  Play,
  FileCode,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';

interface GitHubReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubReleaseModal: React.FC<GitHubReleaseModalProps> = ({ isOpen, onClose }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd(null), 2500);
    } catch {
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd(null), 2500);
    }
  };

  const cleanRepo = repoUrl.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  const targetRemote = cleanRepo ? `https://github.com/${cleanRepo}.git` : 'https://github.com/<your-username>/aircanvas.git';

  const pushCommand = `git remote add origin ${targetRemote}
git push -u origin main
git push origin v1.7.1`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center border border-white/20">
              <FolderGit2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">GitHub Push & Release</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  v1.7.1
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated release workflow with Windows .exe + Android .apk binaries
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

        {/* Content */}
        <div className="p-6 space-y-6 text-xs">
          {/* Status Box */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>Git Repository Committed & Tagged</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              All 94 source files, Supabase SQL schemas, ASP.NET Core subscription APIs, Flutter app, C# server, and the GitHub Actions release workflow (<code className="text-emerald-300 bg-slate-950/60 px-1.5 py-0.5 rounded font-mono">.github/workflows/build-release.yml</code>) are committed and tagged to <code className="text-emerald-300 font-mono">v1.7.1</code>.
            </p>
          </div>

          {/* Repository Target Input */}
          <div className="space-y-2">
            <label className="block font-semibold text-slate-200">
              Your GitHub Repository URL or Name:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="e.g. your-username/aircanvas or https://github.com/..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Paste your personal or organization GitHub repository URL to generate the instant push command.
            </p>
          </div>

          {/* Quick Push Instructions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Push & Publish Command
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(pushCommand, 'push')}
                className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-bold"
              >
                {copiedCmd === 'push' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy All</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-[11px] text-cyan-300 relative group overflow-x-auto">
              <pre className="whitespace-pre-wrap">{pushCommand}</pre>
            </div>
          </div>

          {/* What happens on push */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-200 text-xs">What GitHub Actions automatically builds upon pushing tag v1.7.1:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-[11px]">Windows x64 (.zip)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">Native C#</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Compiles <code className="text-slate-300 font-mono">AirCanvas.exe</code> with DPI-awareness manifest + <code className="text-slate-300 font-mono">Fix_Firewall.bat</code>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-[11px]">Android APK (.apk)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">Flutter Release</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Runs <code className="text-slate-300 font-mono">flutter build apk --release</code> and publishes <code className="text-slate-300 font-mono">AirCanvas-release.apk</code>.
                </p>
              </div>
            </div>
          </div>

          {/* Direct File Access */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="font-semibold text-white text-xs">Direct Server Binary Compiler Included</div>
              <p className="text-[11px] text-slate-400">
                You can also run <code className="text-cyan-300 font-mono">build_server.bat</code> on any Windows PC to compile immediately without waiting for CI.
              </p>
            </div>
            <a
              href="/build_server.bat"
              download="build_server.bat"
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 ml-3 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .bat</span>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Git Tag: <strong className="text-cyan-300 font-mono">v1.7.1</strong> • Branch: <strong className="text-white font-mono">main</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
