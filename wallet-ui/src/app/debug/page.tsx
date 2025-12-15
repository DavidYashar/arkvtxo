'use client';

import { useState, useEffect } from 'react';

export default function DebugPage() {
  const [info, setInfo] = useState({
    indexerUrl: '',
    arkServerUrl: '',
  });

  useEffect(() => {
    setInfo({
      indexerUrl: process.env.NEXT_PUBLIC_INDEXER_URL || 'NOT SET',
      arkServerUrl: process.env.NEXT_PUBLIC_ARK_SERVER_URL || 'NOT SET',
    });
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>🔍 Debug Configuration</h1>
      
      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Environment Variables</h2>
        <p><strong>NEXT_PUBLIC_INDEXER_URL:</strong> {info.indexerUrl}</p>
        <p><strong>NEXT_PUBLIC_ARK_SERVER_URL:</strong> {info.arkServerUrl}</p>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', border: '2px solid #ffc107', borderRadius: '8px' }}>
        <h2>⚠️ Browser Cache Issue</h2>
        <p>If the Indexer URL shows <code>http://localhost:3001</code> but tokens still don't work:</p>
        <ol>
          <li>Open a NEW Incognito/Private window</li>
          <li>Go to <code>http://localhost:3001</code></li>
          <li>Try creating a token</li>
        </ol>
        <p><strong>Why?</strong> Your browser has cached old JavaScript files that use the wrong URL.</p>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #17a2b8', borderRadius: '8px' }}>
        <h2>Test Indexer Connection</h2>
        <button
          onClick={async () => {
            try {
              const response = await fetch('http://localhost:3001/health');
              const data = await response.json();
              alert('✅ Indexer is working!\n\n' + JSON.stringify(data, null, 2));
            } catch (error) {
              alert('❌ Indexer connection failed:\n\n' + (error as Error).message);
            }
          }}
          style={{
            padding: '0.5rem 1rem',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Test Connection to Indexer
        </button>
      </div>
    </div>
  );
}
