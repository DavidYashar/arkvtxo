'use client';

import { useState, useEffect } from 'react';
import { History, ArrowUpRight, ArrowDownLeft, X, Lock } from 'lucide-react';
import { getWallet, getWalletAsync } from '@/lib/wallet';
import type { TokenTransfer } from '@arkade-token/sdk';

interface TokenDetails {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

interface TransferDetails extends TokenTransfer {
  tokenDetails?: TokenDetails;
}

export default function TransactionHistory() {
  const [transfers, setTransfers] = useState<TokenTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [myAddress, setMyAddress] = useState<string>('');
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetails | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);
  const [checkingWhitelist, setCheckingWhitelist] = useState(true);

  const loadHistory = async () => {
    const wallet = await getWalletAsync();
    if (!wallet) return;

    try {
      setLoading(true);
      const addr = await wallet.getAddress();
      setMyAddress(addr);
      
      const history = await wallet.getTokenTransfers();
      setTransfers(history);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkWhitelist = async () => {
      const wallet = await getWalletAsync();
      if (wallet) {
        try {
          const address = await wallet.getAddress();
          
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
    loadHistory();
    
    // Refresh every 15 seconds
    const interval = setInterval(loadHistory, 15000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatTokenAmount = (amount: string | bigint, decimals: number) => {
    const num = typeof amount === 'string' ? BigInt(amount) : amount;
    const divisor = BigInt(10 ** decimals);
    const whole = num / divisor;
    const remainder = num % divisor;
    
    if (decimals === 0) {
      return whole.toString();
    }
    
    const decimalPart = remainder.toString().padStart(decimals, '0');
    return `${whole.toString()}.${decimalPart}`;
  };

  const isReceived = (transfer: TokenTransfer) => {
    return transfer.to === myAddress;
  };

  const handleTransferClick = async (transfer: TokenTransfer) => {
    setSelectedTransfer({ ...transfer });
    setModalLoading(true);

    try {
      // Fetch token details to get decimals
      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      const response = await fetch(`${indexerUrl}/api/tokens/${transfer.tokenId}`);
      if (response.ok) {
        const tokenDetails = await response.json();
        setSelectedTransfer({ ...transfer, tokenDetails });
      } else {
        console.error('Failed to fetch token details:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch token details:', error);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedTransfer(null);
  };

  // Show loading while checking whitelist
  if (checkingWhitelist) {
    return (
      <div className="p-6 border border-blue-200 rounded-lg bg-white">
        <div className="flex items-center gap-3 mb-6">
          <History className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">Token Transaction History</h3>
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
          <History className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-semibold text-gray-900">Token Transaction History</h3>
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
      <div className="flex items-center gap-3 mb-6">
        <History className="w-6 h-6 text-blue-600" />
        <h3 className="text-xl font-semibold text-gray-900">Token Transaction History</h3>
      </div>

      {loading && transfers.length === 0 ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading transactions...</p>
        </div>
      ) : transfers.length === 0 ? (
        <div className="text-center py-12">
          <History className="w-16 h-16 mx-auto mb-4 text-blue-300" />
          <p className="text-gray-600">No transactions yet</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {transfers.map((transfer, index) => {
            const received = isReceived(transfer);
            return (
              <div
                key={`${transfer.txid}-${index}`}
                onClick={() => handleTransferClick(transfer)}
                className="p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {received ? (
                      <ArrowDownLeft className="w-5 h-5 text-blue-600 mt-1" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-gray-600 mt-1" />
                    )}
                    <div>
                      <p className={`font-semibold ${received ? 'text-gray-900' : 'text-gray-700'}`}>
                        {received ? 'Received' : 'Sent'}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {received ? 'From' : 'To'}: {(received ? transfer.from : transfer.to)?.slice(0, 20) || 'Unknown'}...
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {formatDate(transfer.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${received ? 'text-gray-900' : 'text-gray-700'}`}>
                      {received ? '+' : '-'}{transfer.amount.toString()}
                    </p>
                    <p className="text-xs text-gray-600 font-mono mt-1">
                      {transfer.tokenId.slice(0, 8)}...
                    </p>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-blue-200">
                  <p className="text-xs text-gray-600">
                    TX: {transfer.txid.slice(0, 16)}...
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transfer Details Modal */}
      {selectedTransfer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-blue-500 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Transfer Details</h2>
              <button
                onClick={closeModal}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {modalLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading token details...</p>
                </div>
              ) : (
                <>
                  {/* Token Info */}
                  {selectedTransfer.tokenDetails && (
                    <>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-xs text-gray-600 mb-1">Token Name</p>
                        <p className="text-gray-900 font-semibold text-lg">{selectedTransfer.tokenDetails.name}</p>
                      </div>

                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-xs text-gray-600 mb-1">Token Symbol</p>
                        <p className="text-gray-900 font-semibold">{selectedTransfer.tokenDetails.symbol}</p>
                      </div>
                    </>
                  )}

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Token ID</p>
                    <p className="text-gray-900 font-mono text-xs break-all">{selectedTransfer.tokenId}</p>
                  </div>

                  {/* Amount */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Amount Transferred</p>
                    <p className="text-gray-900 font-semibold text-xl">
                      {selectedTransfer.tokenDetails
                        ? formatTokenAmount(
                            selectedTransfer.amount,
                            selectedTransfer.tokenDetails.decimals
                          )
                        : selectedTransfer.amount.toString()}{' '}
                      {selectedTransfer.tokenDetails?.symbol || ''}
                    </p>
                  </div>

                  {/* Sender */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Sender (Arkade Address)</p>
                    <p className="text-gray-900 font-mono text-xs break-all">
                      {selectedTransfer.from}
                    </p>
                    {selectedTransfer.from === myAddress && (
                      <p className="mt-2 text-xs font-semibold text-blue-600">
                        ✓ This is your address
                      </p>
                    )}
                  </div>

                  {/* Receiver */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Receiver (Arkade Address)</p>
                    <p className="text-gray-900 font-mono text-xs break-all">
                      {selectedTransfer.to}
                    </p>
                    {selectedTransfer.to === myAddress && (
                      <p className="mt-2 text-xs font-semibold text-blue-600">
                        ✓ This is your address
                      </p>
                    )}
                  </div>

                  {/* Transaction ID */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Transaction ID (VTXO ID)</p>
                    <p className="text-gray-900 font-mono text-xs break-all">
                      {selectedTransfer.txid}
                    </p>
                  </div>

                  {/* Timestamp */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Timestamp</p>
                    <p className="text-gray-900 font-semibold">
                      {formatDate(selectedTransfer.timestamp)}
                    </p>
                  </div>

                  {/* Block Height (if available) */}
                  {selectedTransfer.blockHeight && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Block Height</p>
                      <p className="text-gray-900 font-semibold">
                        {selectedTransfer.blockHeight.toLocaleString()}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
