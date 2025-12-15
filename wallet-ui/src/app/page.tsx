'use client';

import { useEffect, useState } from 'react';
import CreateToken from '@/components/CreateToken';
import TransferToken from '@/components/TransferToken';
import TokenList from '@/components/TokenList';
import TransactionHistory from '@/components/TransactionHistory';
import SendBitcoin from '@/components/SendBitcoin';
import TransactionExplorer from '@/components/TransactionExplorer';
import VtxoLookup from '@/components/VtxoLookup';

export default function Home() {
  const [privateKey, setPrivateKey] = useState('');

  useEffect(() => {
    // Get private key from session storage
    const key = sessionStorage.getItem('arkade_private_key') || '';
    setPrivateKey(key);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-white text-gray-900">
      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Single Column Layout - Each Section on Its Own Line */}
        <div className="space-y-8 mb-8">
          <SendBitcoin />
          <CreateToken />
          <TransferToken />
          <TokenList />
          <TransactionHistory />
        </div>

        {/* Arkade Transaction History - Full Width */}
        {privateKey && (
          <div className="space-y-8 mb-8">
            <TransactionExplorer privateKey={privateKey} />
            <VtxoLookup privateKey={privateKey} />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-blue-200 mt-16 bg-white">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-gray-600 text-sm">
            <p className="mb-2 font-medium">Arkade Token Platform - Bitcoin Layer 2 Token Protocol</p>
            <p className="text-xs">
              Tokens are tracked via OP_RETURN outputs on Bitcoin blockchain
            </p>
            <div className="mt-4 flex items-center justify-center gap-6">
              <a
                href="https://arkade.io"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 transition-colors font-medium"
              >
                Arkade Documentation
              </a>
              <span>•</span>
              <a
                href={`${process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001'}/health`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 transition-colors font-medium"
              >
                Indexer Status
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
