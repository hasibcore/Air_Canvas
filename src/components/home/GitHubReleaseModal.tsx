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
  const [repoUrl, setRepoUrl] = useState('https://github.com/hasibcore/Air_Canvas');
  const [patToken, setPatToken] = useState('');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

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

  const cleanRepo = repoUrl.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '') || 'hasibcore/Air_Canvas';
  const targetRemote = `https://github.com/${cleanRepo}.git`;

  const pushCommand = `git remote set-url origin ${targetRemote}
git push -u origin main
git push origin v1.7.8`;

  const tokenPushCommand = patToken.trim()
    ? `git push https://${patToken.trim()}@github.com/${cleanRepo}.git main
git push https://${patToken.trim()}@github.com/${cleanRepo}.git v1.7.8`
    : `git push https://<YOUR_GITHUB_PERSONAL_ACCESS_TOKEN>@github.com/${cleanRepo}.git main
git push https://<YOUR_GITHUB_PERSONAL_ACCESS_TOKEN>@github.com/${cleanRepo}.git v1.7.8`;

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
                  v1.7.8
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
          {/* Live Release Downloads Box */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-cyan-950/30 to-slate-900 border border-emerald-500/40 space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Check className="w-5 h-5 text-emerald-400 bg-emerald-500/20 rounded-full p-0.5" />
                <span>v1.7.6 Release Binaries Live & Ready</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                PUBLIC RELEASE
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              The official Android APK and native Windows server bundle have been built, verified, and published. You can download them directly below or via GitHub:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <a
                href="/downloads/AirCanvas-release.apk"
                download="AirCanvas-release.apk"
                className="p-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center justify-between group shadow-md transition-all"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  <div className="text-left">
                    <div className="text-xs leading-none">Download APK</div>
                    <div className="text-[10px] text-emerald-100 font-normal mt-0.5">Android (41 MB)</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
              </a>

              <a
                href="/downloads/AirCanvas-Windows-x64.zip"
                download="AirCanvas-Windows-x64.zip"
                className="p-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold flex items-center justify-between group shadow-md transition-all"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  <div className="text-left">
                    <div className="text-xs leading-none">Windows Bundle</div>
                    <div className="text-[10px] text-cyan-100 font-normal mt-0.5">AirCanvas.exe + Firewall (.zip)</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-400">GitHub Tag: <strong className="text-cyan-300 font-mono">v1.7.6</strong></span>
              <a
                href="https://github.com/hasibcore/Air_Canvas/releases/tag/v1.7.6"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1"
              >
                <span>Open Release on GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Status Box */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>Repository & CI/CD Pipeline Configured</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Repository is public at <a href="https://github.com/hasibcore/Air_Canvas" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline font-mono">https://github.com/hasibcore/Air_Canvas</a>. All 94 source files, Supabase schemas, and GitHub Actions release workflows are synchronized on branch <code className="text-cyan-300 font-mono">main</code>.
            </p>
          </div>

          {/* Repository Target Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-slate-200">
                Target GitHub Repository:
              </label>
              <a
                href={`https://github.com/${cleanRepo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 text-[11px]"
              >
                <span>Open on GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/hasibcore/Air_Canvas"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Current remote is set to <code className="text-cyan-300 font-mono">https://github.com/{cleanRepo}.git</code>. Make sure the repository exists under your GitHub account.
            </p>
          </div>

          {/* Quick Push Instructions - Standard Terminal */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Method 1: Push via Standard Git (Terminal / Git Credential Manager)
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
                    <span>Copy Commands</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-[11px] text-cyan-300 relative group overflow-x-auto">
              <pre className="whitespace-pre-wrap">{pushCommand}</pre>
            </div>
          </div>

          {/* Method 2 - Personal Access Token */}
          <div className="space-y-2 p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-purple-400" />
                Method 2: One-Step Push with GitHub Personal Access Token (PAT)
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(tokenPushCommand, 'token-push')}
                className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-bold"
              >
                {copiedCmd === 'token-push' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Token Command</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              If your terminal prompts for password or lacks interactive OAuth, paste your token (<code className="text-purple-300">ghp_...</code>) below to generate the authenticated push command:
            </p>
            <input
              type="password"
              value={patToken}
              onChange={(e) => setPatToken(e.target.value)}
              placeholder="Paste GitHub Personal Access Token (e.g. ghp_...)"
              className="w-full bg-slate-950 border border-purple-500/30 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-400 font-mono"
            />
            <div className="bg-slate-950/80 border border-purple-900/40 rounded-xl p-3 font-mono text-[10px] text-purple-300 overflow-x-auto">
              <pre className="whitespace-pre-wrap">{tokenPushCommand}</pre>
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
        <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              Git Tag: <strong className="text-cyan-300 font-mono">v1.7.1</strong> • Branch: <strong className="text-white font-mono">main</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://github.com/${cleanRepo}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <span>Releases Page</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
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
    </div>
  );
};
