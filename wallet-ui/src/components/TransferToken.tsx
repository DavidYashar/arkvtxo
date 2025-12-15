'use client';

import { useState, useEffect } from 'react';
import { Send, Lock } from 'lucide-react';
import { getWallet, getWalletAsync } from '@/lib/wallet';

export default function TransferToken() {
  const [formData, setFormData] = useState({
    tokenId: '',
    to: '',
    amount: '',
  });
  const [loading, setLoading] = useState(false);
  const [txid, setTxid] = useState<string>('');
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);
  const [userAddress, setUserAddress] = useState<string>('');
  const [checkingWhitelist, setCheckingWhitelist] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const wallet = await getWalletAsync();
    if (!wallet) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      setLoading(true);
      setTxid('');

      const transferTxid = await wallet.transferToken({
        tokenId: formData.tokenId,
        to: formData.to,
        amount: BigInt(formData.amount),
      });

      setTxid(transferTxid);
      alert('Token transferred successfully!');
      
      // Reset form
      setFormData({
        tokenId: '',
        to: '',
        amount: '',
      });
    } catch (error) {
      console.error('Failed to transfer token:', error);
      alert('Failed to transfer token: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Check whitelist on mount
  useEffect(() => {
    const checkWhitelist = async () => {
      const wallet = await getWalletAsync();
      if (wallet) {
        try {
          const address = await wallet.getAddress();
          setUserAddress(address);
          
          const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
          const response = await fetch(`${indexerUrl}/api/whitelist/check/${address}`);
          const data = await response.json();
          setIsWhitelisted(data.isWhitelisted);
        } catch (error) {
          console.error('Failed to check whitelist:', error);
          setIsWhitelisted(false);
        }
      } else {
        setIsWhitelisted(false);
      }
      setCheckingWhitelist(false);
    };

    checkWhitelist();
  }, []);

  // Show loading while checking whitelist
  if (checkingWhitelist) {
    return (
      <div className="p-6 border border-blue-200 rounded-lg bg-white shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <Send className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">Transfer Token</h3>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Checking access...</p>
        </div>
      </div>
    );
  }

  // If not whitelisted, just blur the content
  if (isWhitelisted === false) {
    return (
      <div className="p-6 border border-blue-200 rounded-lg bg-white shadow-lg filter blur-sm pointer-events-none select-none opacity-60">
        <div className="flex items-center gap-3 mb-6">
          <Send className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">Transfer Token</h3>
        </div>
        <div className="space-y-4">
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-12 bg-gray-300 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 border border-blue-200 rounded-lg bg-white shadow-lg">
      <div className="flex items-center gap-3 mb-6">
        <Send className="w-6 h-6 text-blue-600" />
        <h3 className="text-xl font-semibold text-gray-900">Transfer Token</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Token ID
          </label>
          <input
            type="text"
            value={formData.tokenId}
            onChange={(e) => setFormData({ ...formData, tokenId: e.target.value })}
            placeholder="Paste token ID here..."
            required
            className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-gray-900 placeholder-gray-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={formData.to}
            onChange={(e) => setFormData({ ...formData, to: e.target.value })}
            placeholder="bc1q... or tark1..."
            required
            className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-gray-900 placeholder-gray-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount
          </label>
          <input
            type="number"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            placeholder="1000"
            required
            min="1"
            className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
        >
          {loading ? 'Transferring...' : 'Transfer Token'}
        </button>
      </form>

      {txid && (
        <div className="mt-4 p-4 bg-green-50 border-2 border-green-500 rounded-lg shadow-md">
          <p className="text-sm text-green-700 font-semibold mb-1">Transaction ID:</p>
          <p className="text-xs font-mono text-gray-900 break-all">{txid}</p>
        </div>
      )}
    </div>
  );
}
