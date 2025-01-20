import React, { useState, useEffect, useCallback } from 'react';
// Import Tauri APIs with proper error handling
let tauriInvoke, tauriDialog;
try {
  const tauri = await import('@tauri-apps/api');
  tauriInvoke = tauri.invoke;
  tauriDialog = tauri.dialog;
} catch (e) {
  console.warn('Tauri APIs not available:', e);
  tauriInvoke = async () => [];
  tauriDialog = { open: async () => null };
}

import { GitBranch, GitPullRequest, X, 
         Maximize2, Minus, ChevronRight, FolderOpen, RefreshCw, 
         Terminal, AlertTriangle } from 'lucide-react';

// Constants
const REFRESH_INTERVAL = 30000; // 30 seconds
const MAX_COMMITS = 100;
const DEFAULT_BRANCH_COLOR = '#4A9EFF';

// Components
const TitleBarTab = ({ text, active, icon: Icon, onClose }) => (
  <div className={`flex items-center px-3 h-8 space-x-2 border-r border-gray-800 
                   ${active ? 'bg-gray-900' : 'bg-gray-950 hover:bg-gray-900'}`}>
    <Icon size={14} className="text-gray-400" />
    <span className="text-sm text-gray-300">{text}</span>
    {active && (
      <button 
        onClick={onClose}
        className="p-1 hover:bg-gray-800 rounded"
      >
        <X size={14} className="text-gray-400 hover:text-gray-200" />
      </button>
    )}
  </div>
);

const WindowControls = ({ onMinimize, onMaximize, onClose }) => (
  <div className="flex items-center space-x-2 px-2">
    <button 
      onClick={onMinimize}
      className="p-1.5 hover:bg-gray-800 rounded-sm"
      aria-label="Minimize"
    >
      <Minus size={16} className="text-gray-400" />
    </button>
    <button 
      onClick={onMaximize}
      className="p-1.5 hover:bg-gray-800 rounded-sm"
      aria-label="Maximize"
    >
      <Maximize2 size={16} className="text-gray-400" />
    </button>
    <button 
      onClick={onClose}
      className="p-1.5 hover:bg-red-500 rounded-sm"
      aria-label="Close"
    >
      <X size={16} className="text-gray-400" />
    </button>
  </div>
);

const ErrorMessage = ({ message, onRetry }) => (
  <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg m-4">
    <div className="flex items-center space-x-2 text-red-500 mb-2">
      <AlertTriangle size={20} />
      <span className="font-medium">Error</span>
    </div>
    <p className="text-sm text-gray-300 mb-3">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-500 
                   rounded text-sm font-medium transition-colors"
      >
        Retry
      </button>
    )}
  </div>
);

const GitTide = () => {
  // State
  const [currentRepo, setCurrentRepo] = useState(null);
  const [branches, setBranches] = useState([]);
  const [gitHistory, setGitHistory] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !currentRepo) return;

    const intervalId = setInterval(refreshData, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [autoRefresh, currentRepo]);

  // Initial load effect
  useEffect(() => {
    if (currentRepo) {
      refreshData();
    }
  }, [currentRepo]);

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      const [branchesData, historyData] = await Promise.all([
        tauriInvoke('get_branches'),
        tauriInvoke('get_git_history')
      ]);
      
      setBranches(branchesData || []);
      setGitHistory(historyData || []);
      setError(null);
    } catch (err) {
      console.error('Failed to refresh data:', err);
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [currentRepo]);

  const handleOpenRepository = async () => {
    try {
      const selected = await tauriDialog.open({
        directory: true,
        multiple: false,
        title: 'Select Git Repository'
      });
      
      if (selected) {
        setLoading(true);
        await tauriInvoke('open_repository', { path: selected });
        setCurrentRepo(selected);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to open repository:', err);
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleCloseRepository = () => {
    setCurrentRepo(null);
    setBranches([]);
    setGitHistory([]);
    setSelectedCommit(null);
    setError(null);
  };

  const calculatePath = useCallback((startX, startY, endX, endY) => {
    const radius = 10;
    const minVerticalDist = radius * 2;
    const verticalDist = Math.abs(endY - startY);
    
    if (startX === endX) {
      return `M ${startX} ${startY} L ${endX} ${endY}`;
    } else if (verticalDist < minVerticalDist) {
      const midY = (startY + endY) / 2;
      return `M ${startX} ${startY} 
              Q ${startX} ${midY} ${(startX + endX) / 2} ${midY}
              Q ${endX} ${midY} ${endX} ${endY}`;
    } else {
      const directionY = endY > startY ? 1 : -1;
      const cornerY = directionY === 1 ? endY - radius : endY + radius;
      
      return `M ${startX} ${startY}
              L ${startX} ${cornerY}
              Q ${startX} ${endY} ${startX + (endX > startX ? radius : -radius)} ${endY}
              L ${endX} ${endY}`;
    }
  }, []);

  const handleCommitClick = useCallback((commit) => {
    setSelectedCommit(selectedCommit?.id === commit.id ? null : commit);
  }, [selectedCommit]);

  const handleWindowControls = {
    minimize: () => tauriInvoke('window_minimize'),
    maximize: () => tauriInvoke('window_maximize'),
    close: () => tauriInvoke('window_close')
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Custom Titlebar */}
      <div className="h-10 flex items-center justify-between bg-gray-950 select-none">
        <div className="flex items-center flex-1">
          <div className="flex items-center px-3 space-x-2">
            <GitBranch size={16} className="text-blue-400" />
            <span className="text-sm text-gray-300">GitTide</span>
          </div>
          {currentRepo && (
            <TitleBarTab 
              text={`Workspace / ${currentRepo.split('/').pop()}`} 
              icon={FolderOpen} 
              active={true}
              onClose={handleCloseRepository}
            />
          )}
        </div>
        <WindowControls 
          onMinimize={handleWindowControls.minimize}
          onMaximize={handleWindowControls.maximize}
          onClose={handleWindowControls.close}
        />
      </div>

      {error && <ErrorMessage message={error} onRetry={refreshData} />}

      {!currentRepo ? (
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={handleOpenRepository}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors duration-200"
            disabled={loading}
          >
            {loading ? 'Opening...' : 'Open Repository'}
          </button>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-64 bg-gray-950 border-r border-gray-800">
            <div className="p-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">
                  {currentRepo.split('/').pop()}
                </span>
                <ChevronRight size={16} className="text-gray-500" />
              </div>
            </div>

            {/* Branch Selection */}
            <div className="p-2">
              <div className="text-sm text-gray-400 mb-2">LOCAL</div>
              <div className="pl-2 space-y-1">
                {branches.map(branch => (
                  <div 
                    key={branch.name}
                    className={`flex items-center space-x-2 text-sm 
                              ${branch.is_head ? 'text-blue-400' : 'text-gray-300'} 
                              hover:bg-gray-800 rounded p-1 cursor-pointer`}
                  >
                    <GitBranch size={14} />
                    <span>{branch.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center Content */}
          <div className="flex-1 flex flex-col bg-gray-950">
            {/* Toolbar */}
            <div className="h-12 border-b border-gray-800 flex items-center px-4 space-x-2">
              <button 
                className="p-2 hover:bg-gray-800 rounded"
                onClick={refreshData}
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw 
                  size={16} 
                  className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} 
                />
              </button>
              <div className="h-6 w-px bg-gray-800 mx-2" />
              <button 
                className="p-2 hover:bg-gray-800 rounded"
                title="Toggle Terminal"
              >
                <Terminal size={16} className="text-gray-400" />
              </button>
              <div className="flex-1" />
              <label className="flex items-center space-x-2 text-sm text-gray-400">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-blue-600 
                           rounded border-gray-700 bg-gray-800"
                />
                <span>Auto-refresh</span>
              </label>
            </div>

            {/* Git Graph */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw size={24} className="text-gray-400 animate-spin" />
                </div>
              ) : (
                <svg width="100%" height={gitHistory.length * 80 + 80}>
                  {/* Draw continuous branch lines first */}
                  {gitHistory.map((commit, index) => {
                    const x = 40 + commit.position * 20;
                    const y = index * 80 + 40;
                    const nextCommit = gitHistory[index + 1];
                    if (nextCommit && nextCommit.position === commit.position) {
                      return (
                        <line
                          key={`branch-${commit.id}`}
                          x1={x}
                          y1={y}
                          x2={x}
                          y2={y + 80}
                          stroke={commit.color}
                          strokeWidth="2"
                        />
                      );
                    }
                    return null;
                  })}
                  
                  {/* Draw branch connections */}
                  {gitHistory.map((commit, index) => {
                    if (commit.parents.length > 0) {
                      const startX = 40 + commit.position * 20;
                      const startY = index * 80 + 40;
                      const parentCommit = gitHistory.find(c => c.id === commit.parents[0]);
                      if (parentCommit) {
                        const parentIndex = gitHistory.findIndex(c => c.id === parentCommit.id);
                        const endX = 40 + parentCommit.position * 20;
                        const endY = parentIndex * 80 + 40;
                        
                        if (startX !== endX || Math.abs(parentIndex - index) > 1) {
                          return (
                            <path
                              key={`${commit.id}-${parentCommit.id}`}
                              d={calculatePath(startX, startY, endX, endY)}
                              stroke={commit.color}
                              strokeWidth="2"
                              fill="none"
                            />
                          );
                        }
                      }
                    }
                    return null;
                  })}

                  {/* Draw commit nodes and labels */}
                  {gitHistory.map((commit, index) => {
                    const x = 40 + commit.position * 20;
                    const y = index * 80 + 40;
                    const isSelected = selectedCommit?.id === commit.id;
                    
                    return (
                      <g 
                        key={commit.id}
                        onClick={() => handleCommitClick(commit)}
                        className="cursor-pointer"
                      >
                        {/* Selection highlight */}
                        {isSelected && (
                          <rect
                            x={x - 100}
                            y={y - 20}
                            width="800"
                            height="40"
                            fill="rgba(59, 130, 246, 0.1)"
                            rx="4"
                          />
                        )}
                        
                        {/* Commit node */}
                        <circle
                          cx={x}
                          cy={y}
                          r={commit.type === 'merge' ? 8 : 6}
                          fill={commit.type === 'merge' ? 'transparent' : commit.color}
                          stroke={commit.color}
                          strokeWidth={commit.type === 'merge' ? 2 : 0}
                          className={`transition-all duration-200 
                                    ${isSelected ? 'brightness-125' : 'hover:brightness-110'}`}
                        />

                        {/* Commit info */}
                        <foreignObject
                          x={x + 20}
                          y={y - 12}
                          width="800"
                          height="24"
                        >
                          <div className="flex items-center space-x-3">
                            <span className="font-mono text-xs text-gray-400">
                              {commit.id.slice(0, 7)}
                            </span>
                            <span className="text-sm text-gray-300">
                              {commit.message}
                            </span>
                            <span className="text-xs text-gray-500">
                              {commit.timestamp}
                            </span>
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          </div>

          {/* Right Sidebar - Commit Details */}
          <div className="w-80 bg-gray-950 border-l border-gray-800">
            <div className="p-4">
              {selectedCommit ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">
                      Commit Details
                    </span>
                    <button 
                      onClick={() => setSelectedCommit(null)}
                      className="p-1 hover:bg-gray-800 rounded"
                    >
                      <X size={14} className="text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Hash</div>
                      <div className="font-mono text-sm text-gray-300">
                        {selectedCommit.id}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">Author</div>
                      <div className="text-sm text-gray-300">
                        {selectedCommit.author}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">Message</div>
                      <div className="text-sm text-gray-300 whitespace-pre-wrap">
                        {selectedCommit.message}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">Branch</div>
                      <div className="text-sm text-gray-300">
                        {selectedCommit.branch || 'detached'}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">Parents</div>
                      <div className="space-y-1">
                        {selectedCommit.parents.map(parentId => (
                          <div 
                            key={parentId}
                            className="font-mono text-sm text-gray-300"
                          >
                            {parentId.slice(0, 7)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm text-gray-300">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-300">
                      Repository Information
                    </span>
                  </div>
                  <div>
                    <strong>Active Branch:</strong>{' '}
                    {branches.find(b => b.is_head)?.name || 'None'}
                  </div>
                  <div>
                    <strong>Total Commits:</strong> {gitHistory.length}
                  </div>
                  <div>
                    <strong>Local Branches:</strong> {branches.length}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitTide;