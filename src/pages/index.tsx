import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  GitCommit,
  GitMerge,
  RefreshCw,
  Plus,
  Minus,
  X,
  Square,
  MenuIcon,
  Search,
  Settings,
  GitPullRequest,
} from 'lucide-react';

// Types for better type safety
interface Commit {
  hash: string;
  message: string;
  author: string;
  date: string;
  tags?: string[];
  parents: string[];
  branch: string;
  column: number;
}

interface Branch {
  name: string;
  color: string;
}

const App = () => {
  const [maximized, setMaximized] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([
    { name: 'main', color: '#2563eb' },
    { name: 'feature/auth', color: '#16a34a' },
    { name: 'hotfix/123', color: '#dc2626' }
  ]);
  
  const [commits, setCommits] = useState<Commit[]>([
    {
      hash: 'abc123',
      message: 'Merge branch feature/auth',
      author: 'John Doe',
      date: '2024-01-19',
      parents: ['def456', 'ghi789'],
      branch: 'main',
      column: 0,
      tags: ['v1.0.0']
    },
    {
      hash: 'def456',
      message: 'fix: Update authentication flow',
      author: 'Jane Smith',
      date: '2024-01-18',
      parents: ['jkl012'],
      branch: 'main',
      column: 0
    },
    {
      hash: 'ghi789',
      message: 'feat: Add OAuth support',
      author: 'Alice Brown',
      date: '2024-01-17',
      parents: ['mno345'],
      branch: 'feature/auth',
      column: 1
    },
    {
      hash: 'jkl012',
      message: 'chore: Update dependencies',
      author: 'John Doe',
      date: '2024-01-16',
      parents: ['mno345'],
      branch: 'main',
      column: 0
    },
    {
      hash: 'mno345',
      message: 'Initial commit',
      author: 'John Doe',
      date: '2024-01-15',
      parents: [],
      branch: 'main',
      column: 0
    }
  ]);

  const [selectedBranch, setSelectedBranch] = useState('main');
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);

  // Custom Titlebar Component
  const Titlebar = () => (
    <div className="bg-black h-8 flex items-center justify-between select-none drag">
      <div className="flex items-center px-2 no-drag">
        <MenuIcon className="w-4 h-4 text-gray-400 hover:text-white cursor-pointer" />
      </div>
      <div className="flex-1 flex items-center justify-center -ml-20 text-gray-400 text-sm">
        GitTide - /path/to/repository
      </div>
      <div className="flex items-center no-drag">
        <button className="h-8 w-8 flex items-center justify-center hover:bg-gray-900">
          <Minus className="w-4 h-4 text-gray-400 hover:text-white" />
        </button>
        <button 
          className="h-8 w-8 flex items-center justify-center hover:bg-gray-900"
          onClick={() => setMaximized(!maximized)}
        >
          <Square className="w-3.5 h-3.5 text-gray-400 hover:text-white" />
        </button>
        <button className="h-8 w-8 flex items-center justify-center hover:bg-red-600">
          <X className="w-4 h-4 text-gray-400 hover:text-white" />
        </button>
      </div>
    </div>
  );

  // Sidebar Component
  const Sidebar = () => (
    <div className="w-52 bg-black border-r border-gray-800 flex flex-col">
      <div className="p-2 border-b border-gray-800">
        <div className="flex items-center gap-2 bg-gray-900 rounded px-2 py-1">
          <Search className="w-4 h-4 text-gray-400" />
          <input 
            className="bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none w-full"
            placeholder="Search..."
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>BRANCHES</span>
            <Plus className="w-3.5 h-3.5 cursor-pointer hover:text-blue-400" />
          </div>
          {branches.map(branch => (
            <div 
              key={branch.name}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-sm cursor-pointer ${
                selectedBranch === branch.name ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-900'
              }`}
              onClick={() => setSelectedBranch(branch.name)}
            >
              <GitBranch className="w-3.5 h-3.5" style={{ color: branch.color }} />
              {branch.name}
            </div>
          ))}
        </div>
      </div>

      <div className="p-2 border-t border-gray-800">
        <button className="flex items-center gap-2 w-full px-2 py-1 text-sm text-gray-400 hover:text-white">
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </div>
  );

  // Commit Graph Component
  const CommitGraph = () => {
    const renderBranchLines = (commit: Commit, index: number) => {
      const nextCommit = commits[index + 1];
      const prevCommit = commits[index - 1];
      
      return (
        <svg className="absolute left-0 top-0 w-full h-full" style={{ pointerEvents: 'none' }}>
          {/* Vertical branch lines */}
          {branches.map((branch, colIndex) => (
            <line
              key={`vertical-${branch.name}`}
              x1={24 + colIndex * 16}
              y1="0"
              x2={24 + colIndex * 16}
              y2="100%"
              stroke={branch.color}
              strokeWidth="2"
              opacity="0.3"
            />
          ))}
          
          {/* Commit connections */}
          {commit.parents.map(parentHash => {
            const parentCommit = commits.find(c => c.hash === parentHash);
            if (parentCommit) {
              const startX = 24 + commit.column * 16;
              const endX = 24 + parentCommit.column * 16;
              return (
                <path
                  key={`${commit.hash}-${parentHash}`}
                  d={`M ${startX} 12 C ${startX} 24, ${endX} 0, ${endX} 12`}
                  stroke={branches.find(b => b.name === commit.branch)?.color || '#666'}
                  strokeWidth="2"
                  fill="none"
                />
              );
            }
            return null;
          })}
        </svg>
      );
    };

    return (
      <div className="flex-1 bg-black overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 p-2 border-b border-gray-800">
          <button className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-300 hover:bg-gray-900 rounded">
            <RefreshCw className="w-3.5 h-3.5" />
            Fetch
          </button>
          <button className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-300 hover:bg-gray-900 rounded">
            <GitPullRequest className="w-3.5 h-3.5" />
            Pull
          </button>
          <button className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-300 hover:bg-gray-900 rounded">
            <GitMerge className="w-3.5 h-3.5" />
            Merge
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {commits.map((commit, index) => (
            <div 
              key={commit.hash}
              className={`relative flex items-center gap-3 group hover:bg-gray-900 px-4 py-2 cursor-pointer ${
                selectedCommit === commit.hash ? 'bg-gray-900' : ''
              }`}
              onClick={() => setSelectedCommit(commit.hash)}
            >
              {renderBranchLines(commit, index)}
              
              <div className="relative flex items-center">
                <GitCommit 
                  className="w-3.5 h-3.5 relative z-10"
                  style={{ color: branches.find(b => b.name === commit.branch)?.color }}
                />
              </div>
              
              <div className="flex items-center gap-3 text-sm min-w-0 relative z-10">
                <span className="font-mono text-yellow-500">{commit.hash.substring(0, 7)}</span>
                <span className="text-gray-300 truncate">{commit.message}</span>
                {commit.tags?.map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 bg-gray-800 text-yellow-500 rounded text-xs">
                    {tag}
                  </span>
                ))}
                <span className="text-gray-500 whitespace-nowrap">{commit.author}</span>
                <span className="text-gray-500 whitespace-nowrap">{commit.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-black text-white">
      <Titlebar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <CommitGraph />
      </div>
    </div>
  );
};

export default App;