'use client';

import { useState, useEffect } from 'react';
import { Coins, RefreshCw, X, Send as SendIcon, Info, Lock } from 'lucide-react';
import { getWallet, getWalletAsync } from '@/lib/wallet';
import type { TokenBalance } from '@arkade-token/sdk';

interface TokenDetails {
  id: string;
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  creator: string;
  createdAt: string;
  createdInTx: string;
}

export default function TokenList() {
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendForm, setSendForm] = useState({ to: '', amount: '' });
  const [sending, setSending] = useState(false);
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);
  const [userAddress, setUserAddress] = useState<string>('');

  const formatTokenAmount = (amount: string | bigint, decimals: number) => {
    const num = BigInt(amount);
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
  };

  const loadTokens = async () => {
    const wallet = await getWalletAsync();
    if (!wallet) return;

    try {
      setLoading(true);
      
      // Load balances from indexer API (this is address-specific)
      const balances = await wallet.getTokenBalances();
      setTokens(balances);
      console.log('Loaded token balances from indexer:', balances.length, 'tokens');
    } catch (error) {
      console.error('Failed to load tokens from indexer:', error);
      // Don't fallback to localStorage - it's not address-specific
      setTokens([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkWhitelist();
    loadTokens();
    
    // Refresh every 10 seconds
    const interval = setInterval(loadTokens, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleShowDetails = async (token: TokenBalance) => {
    setSelectedToken(token);
    setShowDetailsModal(true);
    
    // Fetch full token details from indexer
    try {
      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      const response = await fetch(`${indexerUrl}/api/tokens/${token.tokenId}`);
      if (response.ok) {
        const details = await response.json();
        setTokenDetails(details);
      }
    } catch (error) {
      console.error('Failed to fetch token details:', error);
    }
  };

  const handleShowSend = (token: TokenBalance) => {
    setSelectedToken(token);
    setShowSendModal(true);
    setSendForm({ to: '', amount: '' });
  };

  const handleSend = async () => {
    if (!selectedToken || !sendForm.to || !sendForm.amount) {
      alert('Please fill in all fields');
      return;
    }

    const wallet = await getWalletAsync();
    if (!wallet) {
      alert('Wallet not connected');
      return;
    }

    try {
      setSending(true);
      
      await wallet.transferToken({
        tokenId: selectedToken.tokenId,
        to: sendForm.to,
        amount: BigInt(sendForm.amount),
      });

      alert('Token sent successfully!');
      setShowSendModal(false);
      setSendForm({ to: '', amount: '' });
      loadTokens(); // Refresh balances
    } catch (error) {
      console.error('Failed to send token:', error);
      alert('Failed to send token: ' + (error as Error).message);
    } finally {
      setSending(false);
    }
  };

  // Show loading while checking whitelist
  if (isWhitelisted === null) {
    return (
      <div className="p-6 border border-blue-200 rounded-lg bg-white">
        <div className="flex items-center gap-3 mb-6">
          <Coins className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">My Tokens</h3>
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
      <div className="p-6 border border-blue-200 rounded-lg bg-white filter blur-sm pointer-events-none select-none opacity-60">
        <div className="flex items-center gap-3 mb-6">
          <Coins className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">My Tokens</h3>
        </div>
        <div className="space-y-3">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="h-4 bg-gray-300 rounded mb-2"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 border border-blue-200 rounded-lg bg-white">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Coins className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">My Tokens</h3>
        </div>
        <button
          onClick={loadTokens}
          disabled={loading}
          className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {tokens.length === 0 ? (
        <div className="text-center py-12">
          <Coins className="w-16 h-16 mx-auto mb-4 text-blue-300" />
          <p className="text-gray-600">No tokens found</p>
          <p className="text-sm text-gray-600 mt-2">Create your first token to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <div
              key={token.tokenId}
              className="p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-gray-900 font-semibold">{token.symbol || 'Unknown'}</h4>
                  <p className="text-xs text-gray-600 font-mono">{token.tokenId.slice(0, 16)}...</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{token.balance.toString()}</p>
                  <p className="text-xs text-gray-600">Balance</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => handleShowSend(token)}
                  className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors shadow-lg flex items-center justify-center gap-1"
                >
                  <SendIcon className="w-4 h-4" />
                  Send
                </button>
                <button 
                  onClick={() => handleShowDetails(token)}
                  className="flex-1 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 text-sm rounded transition-colors shadow-lg flex items-center justify-center gap-1"
                >
                  <Info className="w-4 h-4" />
                  Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedToken && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-blue-500 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Token Details</h2>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setTokenDetails(null);
                }}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {tokenDetails ? (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Name</p>
                  <p className="text-gray-900 font-semibold">{tokenDetails.name}</p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Symbol</p>
                  <p className="text-gray-900 font-semibold">{tokenDetails.symbol}</p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Total Supply</p>
                  <p className="text-gray-900 font-semibold">
                    {formatTokenAmount(tokenDetails.totalSupply, tokenDetails.decimals)} {tokenDetails.symbol}
                  </p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Decimals</p>
                  <p className="text-gray-900 font-semibold">{tokenDetails.decimals}</p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Your Balance</p>
                  <p className="text-gray-900 font-semibold">
                    {formatTokenAmount(selectedToken.balance.toString(), tokenDetails.decimals)} {tokenDetails.symbol}
                  </p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Creator Address</p>
                  <p className="text-gray-900 font-mono text-xs break-all">{tokenDetails.creator}</p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Token ID</p>
                  <p className="text-gray-900 font-mono text-xs break-all">{tokenDetails.id}</p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Created In Transaction</p>
                  <p className="text-gray-900 font-mono text-xs break-all">{tokenDetails.createdInTx}</p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Created At</p>
                  <p className="text-gray-900 text-sm">{new Date(tokenDetails.createdAt).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-gray-600 mt-4">Loading details...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && selectedToken && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-blue-500 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Send {selectedToken.symbol}</h2>
              <button
                onClick={() => setShowSendModal(false)}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4 bg-blue-50 p-4 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">Available Balance</p>
              <p className="text-2xl font-bold text-gray-900">{selectedToken.balance.toString()}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={sendForm.to}
                  onChange={(e) => setSendForm({ ...sendForm, to: e.target.value })}
                  placeholder="tark1q..."
                  className="w-full px-4 py-2 bg-white border border-blue-300 rounded-lg text-gray-900 placeholder-gray-400 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount
                </label>
                <input
                  type="number"
                  value={sendForm.amount}
                  onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
                  placeholder="100"
                  min="1"
                  max={selectedToken.balance.toString()}
                  className="w-full px-4 py-2 bg-white border border-blue-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
                />
              </div>

              <button
                onClick={handleSend}
                disabled={sending || !sendForm.to || !sendForm.amount}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
              >
                {sending ? 'Sending...' : 'Send Token'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
