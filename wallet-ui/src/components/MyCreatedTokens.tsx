'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Copy, CheckCircle } from 'lucide-react';
import { getTokens } from '@/lib/tokenStorage';
import type { StoredTokenMetadata } from '@/lib/tokenStorage';

export default function MyCreatedTokens() {
  const [tokens, setTokens] = useState<StoredTokenMetadata[]>([]);
  const [copiedId, setCopiedId] = useState<string>('');

  useEffect(() => {
    const loadTokens = () => {
      const storedTokens = getTokens();
      setTokens(storedTokens);
    };
    
    loadTokens();
    
    // Listen for storage changes (when new tokens are created)
    const handleStorage = () => loadTokens();
    window.addEventListener('storage', handleStorage);
    
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const copyToClipboard = (text: string, tokenId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(tokenId);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const formatSupply = (supply: string, decimals: number) => {
    const num = BigInt(supply);
    const divisor = BigInt(10 ** decimals);
    const whole = num / divisor;
    const remainder = num % divisor;
    
    if (decimals === 0) {
      return whole.toString();
    }
    
    // Pad remainder with leading zeros
    const decimalPart = remainder.toString().padStart(decimals, '0');
    return `${whole.toString()}.${decimalPart}`;
  };

  if (tokens.length === 0) {
    return (
      <div className="p-6 border border-blue-200 rounded-lg bg-white shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-6 h-6 text-purple-500" />
          <h3 className="text-xl font-semibold text-gray-900">My Created Tokens</h3>
        </div>
        <p className="text-gray-600 text-center py-8">
          No tokens created yet. Create your first token above!
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 border border-blue-200 rounded-lg bg-white shadow-lg">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-blue-600" />
        <h3 className="text-xl font-semibold text-gray-900">My Created Tokens</h3>
        <span className="ml-auto text-sm text-gray-600">{tokens.length} token{tokens.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-3">
        {tokens.map((token) => (
          <div
            key={token.tokenId}
            className="p-4 bg-blue-50 rounded-lg border border-blue-200 hover:border-blue-400 transition-colors shadow-md"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900">{token.name}</h4>
                <p className="text-sm text-gray-600">{token.symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Total Supply</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatSupply(token.totalSupply, token.decimals)} {token.symbol}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-700 font-medium min-w-[80px]">Token ID:</span>
                <code className="flex-1 text-xs text-gray-900 font-mono bg-blue-100 px-2 py-1 rounded overflow-x-auto shadow-sm">
                  {token.tokenId}
                </code>
                <button
                  onClick={() => copyToClipboard(token.tokenId, token.tokenId)}
                  className="p-1 hover:bg-blue-200 rounded transition-colors"
                  title="Copy Token ID"
                >
                  {copiedId === token.tokenId ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>Decimals: {token.decimals}</span>
                <span>•</span>
                <span>Created: {new Date(token.createdAt).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
        <p className="text-xs text-gray-700 font-medium">
          Copy the Token ID to transfer tokens to other Arkade addresses
        </p>
      </div>
    </div>
  );
}
