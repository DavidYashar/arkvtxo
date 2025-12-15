'use client';

import { useState, useEffect } from 'react';
import { Search, History, Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Clock, AlertCircle, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface TransactionExplorerProps {
  privateKey: string;
}

interface Transaction {
  boardingTxid: string;
  commitmentTxid: string;
  arkTxid: string;
  type: 'SENT' | 'RECEIVED';
  amount: number;
  settled: boolean;
  createdAt: number;
}

export default function TransactionExplorer({ privateKey }: TransactionExplorerProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [copiedTxid, setCopiedTxid] = useState<string | null>(null);

  const loadTransactions = async () => {
    if (!privateKey) {
      setError('No private key available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      const response = await fetch(`${indexerUrl}/api/asp/sdk/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateKey })
      });

      const data = await response.json();

      if (data.success) {
        setTransactions(data.transactions || []);
      } else {
        setError(data.error || 'Failed to load transactions');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (privateKey) {
      loadTransactions();
    }
  }, [privateKey]);

  const formatAmount = (amount: number) => {
    return amount.toLocaleString() + ' sats';
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getTxid = (tx: Transaction) => {
    return tx.boardingTxid || tx.commitmentTxid || tx.arkTxid || 'N/A';
  };

  const copyTxid = async (txid: string) => {
    try {
      await navigator.clipboard.writeText(txid);
      setCopiedTxid(txid);
      setTimeout(() => setCopiedTxid(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const displayedTransactions = showAll ? transactions : transactions.slice(0, 3);

  return (
    <div className="p-6 border border-blue-200 rounded-lg bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-blue-700" />
          <h3 className="text-xl font-semibold text-blue-900">Transaction History</h3>
        </div>
        <button
          onClick={loadTransactions}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-300 border-t-blue-700 rounded-full animate-spin mb-4" />
          <p className="text-blue-700">Loading transactions...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && transactions.length === 0 && !error && (
        <div className="text-center py-12">
          <History className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-600">No transactions found</p>
        </div>
      )}

      {/* Transactions List */}
      {transactions.length > 0 && (
        <div className="space-y-3">
          {/* Info banner about pending transactions */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-800">
                <strong>Note:</strong> "Pending" status is normal - the assets are already in your wallet. 
                Recent transactions may take a moment to appear. <strong>Minimum transfer: 1,000 sats</strong>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>Total: {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</span>
            <span className="text-xs text-gray-500">
              {showAll ? 'Showing all' : `Showing top ${Math.min(3, transactions.length)}`}
            </span>
          </div>

          {/* Scrollable container with fixed height */}
          <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-gray-100">
            {displayedTransactions.map((tx, index) => (
            <div
              key={index}
              className="p-4 bg-gradient-to-r from-blue-50 to-white border border-blue-100 rounded-lg hover:shadow-md transition-shadow"
            >
              {/* Transaction Type & Amount */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {tx.type === 'RECEIVED' ? (
                    <div className="p-2 bg-green-100 rounded-full">
                      <ArrowDownLeft className="w-5 h-5 text-green-600" />
                    </div>
                  ) : (
                    <div className="p-2 bg-red-100 rounded-full">
                      <ArrowUpRight className="w-5 h-5 text-red-600" />
                    </div>
                  )}
                  <div>
                    <div className={`text-lg font-semibold ${
                      tx.type === 'RECEIVED' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {tx.type === 'RECEIVED' ? '+' : '-'}{formatAmount(tx.amount)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {tx.type === 'RECEIVED' ? 'Received' : 'Sent'}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  tx.settled 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {tx.settled ? 'Settled' : 'Pending'}
                </span>
              </div>

              {/* Transaction Details */}
              <div className="space-y-2 text-sm">
                {/* TXID with Copy Button */}
                <div className="bg-gray-50 p-2 rounded border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-500 text-xs font-semibold">TXID:</span>
                    <button
                      onClick={() => copyTxid(getTxid(tx))}
                      className="flex items-center gap-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs transition-colors"
                      title="Copy TXID"
                    >
                      {copiedTxid === getTxid(tx) ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <span className="text-gray-900 font-mono text-[10px] break-all block">
                    {getTxid(tx)}
                  </span>
                </div>

                {/* Timestamp */}
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {formatDate(tx.createdAt)}
                  </span>
                </div>

                {/* Transaction Type Details */}
                {tx.boardingTxid && (
                  <div className="mt-2 pt-2 border-t border-blue-100">
                    <span className="text-xs text-blue-600 font-medium">
                      Boarding Transaction
                    </span>
                  </div>
                )}
                {tx.commitmentTxid && (
                  <div className="mt-2 pt-2 border-t border-blue-100">
                    <span className="text-xs text-purple-600 font-medium">
                      Commitment Transaction
                    </span>
                  </div>
                )}
                {tx.arkTxid && (
                  <div className="mt-2 pt-2 border-t border-blue-100">
                    <span className="text-xs text-indigo-600 font-medium">
                      Ark Transaction
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>

          {/* Show More/Less Button */}
          {transactions.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full mt-3 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {showAll ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span>Show Less</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span>Show All ({transactions.length} transactions)</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
