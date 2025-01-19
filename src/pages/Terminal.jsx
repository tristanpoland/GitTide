import React, { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

// Create a client-side only terminal component
const TerminalInner = dynamic(() => Promise.resolve(() => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);

  useEffect(() => {
    // Dynamically import xterm only on client side
    const initializeTerminal = async () => {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      await import('xterm/css/xterm.css');

      if (!terminalRef.current) return;

      // Initialize xterm.js
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Consolas, monospace',
        theme: {
          background: '#00000000',
          foreground: '#ffffff'
        },
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Store refs
      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Open terminal
      terminal.open(terminalRef.current);

      // Initial fit
      setTimeout(() => {
        if (fitAddon) {
          try {
            fitAddon.fit();
            const { rows, cols } = terminal;
            invoke('resize_pty', { rows, cols }).catch(console.error);
          } catch (error) {
            console.error('Fit error:', error);
          }
        }
      }, 100);

      // Initialize PTY
      invoke('create_pty').catch(console.error);

      // Listen for PTY output
      const unsubscribe = await listen('pty-output', (event) => {
        if (terminal.element) {
          terminal.write(event.payload);
        }
      });

      // Handle input
      terminal.onData(data => {
        invoke('write_to_pty', { input: data }).catch(console.error);
      });

      // Handle resize
      let resizeTimeout;
      const resizeObserver = new ResizeObserver(() => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        
        resizeTimeout = setTimeout(() => {
          if (fitAddon && terminal.element) {
            try {
              fitAddon.fit();
              const { rows, cols } = terminal;
              invoke('resize_pty', { rows, cols }).catch(console.error);
            } catch (error) {
              console.error('Resize error:', error);
            }
          }
        }, 100);
      });

      resizeObserver.observe(terminalRef.current);

      // Cleanup
      return () => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        unsubscribe.then(fn => fn());
        resizeObserver.disconnect();
        if (terminal) {
          terminal.dispose();
        }
      };
    };

    initializeTerminal().catch(console.error);
  }, []);

  return (
    <div className="h-full w-full" style={{ minHeight: '400px', position: 'relative' }}>
      <div 
        ref={terminalRef} 
        className="h-full w-full absolute inset-0" 
        style={{ padding: '12px' }} 
      />
    </div>
  );
}), {
  ssr: false // This is crucial - it prevents server-side rendering
});

// Export the dynamic component
export default TerminalInner;