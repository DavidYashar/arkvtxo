'use client';

import { useState } from 'react';
import { Search, CheckCircle, XCircle, AlertCircle, Wallet as WalletIcon } from 'lucide-react';

interface VtxoLookupProps {
  privateKey: string;
}

interface VtxoInfo {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
  };
  virtualStatus: {
    state: string;
    commitmentTxIds?: string[];
    batchExpiry?: number;
  };
  createdAt: string;
  isSpent: boolean;
  isUnrolled: boolean;
}

interface TransactionInfo {
  boardingTxid: string;
  commitmentTxid: string;
  arkTxid: string;
  type: 'SENT' | 'RECEIVED';
  amount: number;
  settled: boolean;
  createdAt: number;
}

export default function VtxoLookup({ privateKey }: VtxoLookupProps) {
  const [searchTxid, setSearchTxid] = useState('');
  const [loading, setLoading] = useState(false);
  const [vtxoInfo, setVtxoInfo] = useState<VtxoInfo | null>(null);
  const [transactionInfo, setTransactionInfo] = useState<TransactionInfo | null>(null);
  const [resultType, setResultType] = useState<'vtxo' | 'transaction' | 'not_found' | null>(null);
  const [existsInWallet, setExistsInWallet] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookupVtxo = async () => {
    if (!searchTxid.trim()) {
      setError('Please enter a TXID');
      return;
    }

    setLoading(true);
    setError(null);
    setVtxoInfo(null);
    setTransactionInfo(null);
    setResultType(null);
    setExistsInWallet(null);

    try {
      // Check if VTXO or Transaction exists in user's wallet using SDK
      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      const verifyResponse = await fetch(`${indexerUrl}/api/asp/sdk/verify-vtxo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          privateKey, 
          vtxoId: searchTxid 
        })
      });

      const verifyData = await verifyResponse.json();

      if (verifyData.success && verifyData.exists) {
        setExistsInWallet(true);
        setResultType(verifyData.type);

        if (verifyData.type === 'vtxo') {
          // VTXO found in wallet
          setVtxoInfo(verifyData.vtxo);
        } else if (verifyData.type === 'transaction') {
          // Transaction found in history
          setTransactionInfo(verifyData.transaction);
        }
      } else {
        // Not found
        setExistsInWallet(false);
        setResultType('not_found');
        setError(verifyData.message || 'Transaction ID not found in your wallet or history');
      }

    } catch (err: any) {
      setError(err.message || 'Failed to lookup transaction');
    } finally {
      setLoading(false);
    }
  };

  const formatSats = (sats: number) => {
    return (sats / 100_000_000).toFixed(8) + ' BTC';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="p-6 border border-blue-200 rounded-lg bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <WalletIcon className="w-6 h-6 text-blue-600" />
        <h3 className="text-xl font-semibold text-gray-900">VTXO Lookup</h3>
      </div>

      {/* Info Banner */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-800">
            <strong>How VTXOs work:</strong> When you send Bitcoin, your old VTXO is spent ("swept") and new VTXOs are created. 
            The TXID shown in transaction history is the new VTXO created for the recipient. Your balance is always correct even if individual VTXOs show as "swept".
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Transaction ID (TXID)
          </label>
          <input
            type="text"
            value={searchTxid}
            onChange={(e) => setSearchTxid(e.target.value)}
            placeholder="Enter VTXO or Transaction ID..."
            className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-gray-900 placeholder-gray-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          onClick={lookupVtxo}
          disabled={loading || !searchTxid.trim()}
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Looking up...</span>
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              <span>Lookup Transaction</span>
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* Results */}
      {existsInWallet !== null && (
        <div className="space-y-4">
          {/* Overall Status */}
          <div className={`p-4 rounded-lg border-2 ${
            existsInWallet 
              ? 'bg-green-50 border-green-300' 
              : 'bg-red-50 border-red-300'
          }`}>
            <div className="flex items-center gap-3">
              {existsInWallet ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : (
                <XCircle className="w-6 h-6 text-red-600" />
              )}
              <div>
                <div className={`text-lg font-semibold ${
                  existsInWallet ? 'text-green-800' : 'text-red-800'
                }`}>
                  {existsInWallet 
                    ? (resultType === 'vtxo' ? 'VTXO Found in Your Wallet' : 'Transaction Found in Your History')
                    : 'Not Found in Your Wallet'}
                </div>
                <div className={`text-sm ${
                  existsInWallet ? 'text-green-700' : 'text-red-700'
                }`}>
                  {existsInWallet 
                    ? (resultType === 'vtxo' 
                        ? 'This VTXO belongs to you' 
                        : 'This transaction appears in your history')
                    : 'This ID is not associated with your wallet'
                  }
                </div>
              </div>
            </div>
          </div>

          {/* VTXO Details */}
          {vtxoInfo && resultType === 'vtxo' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-900 mb-3">VTXO Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">TXID:</span>
                  <span className="text-gray-900 font-mono text-xs break-all ml-2">
                    {vtxoInfo.txid}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Value:</span>
                  <span className="text-gray-900 font-semibold">
                    {vtxoInfo.value.toLocaleString()} sats
                    <span className="text-gray-500 ml-2">
                      ({formatSats(vtxoInfo.value)})
                    </span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-semibold ${
                    vtxoInfo.status.confirmed ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {vtxoInfo.status.confirmed ? 'Confirmed' : 'Pending'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Virtual Status:</span>
                  <div className="flex flex-col items-end">
                    <span className="text-gray-900 font-semibold capitalize">
                      {vtxoInfo.virtualStatus.state}
                    </span>
                    {vtxoInfo.virtualStatus.state === 'swept' && (
                      <span className="text-[10px] text-gray-500 italic mt-0.5">
                        (spent in a transaction)
                      </span>
                    )}
                    {vtxoInfo.virtualStatus.state === 'preconfirmed' && (
                      <span className="text-[10px] text-gray-500 italic mt-0.5">
                        (ready to use)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span className="text-gray-900">
                    {formatDate(vtxoInfo.createdAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Spent:</span>
                  <span className={`font-semibold ${
                    vtxoInfo.isSpent ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {vtxoInfo.isSpent ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Transaction Details */}
          {transactionInfo && resultType === 'transaction' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-900 mb-3">Ark Transaction Details</h4>
              <div className="space-y-2 text-sm">
                {transactionInfo.arkTxid && (
                  <div className="bg-white p-2 rounded border border-blue-200">
                    <div className="text-xs text-gray-600 mb-1">Ark Transaction ID:</div>
                    <div className="text-gray-900 font-mono text-[10px] break-all">
                      {transactionInfo.arkTxid}
                    </div>
                  </div>
                )}
                {transactionInfo.boardingTxid && (
                  <div className="bg-white p-2 rounded border border-blue-200">
                    <div className="text-xs text-gray-600 mb-1">Boarding TXID:</div>
                    <div className="text-gray-900 font-mono text-[10px] break-all">
                      {transactionInfo.boardingTxid}
                    </div>
                  </div>
                )}
                {transactionInfo.commitmentTxid && (
                  <div className="bg-white p-2 rounded border border-blue-200">
                    <div className="text-xs text-gray-600 mb-1">Commitment TXID:</div>
                    <div className="text-gray-900 font-mono text-[10px] break-all">
                      {transactionInfo.commitmentTxid}
                    </div>
                  </div>
                )}
                <div className="flex justify-between mt-3">
                  <span className="text-gray-600">Type:</span>
                  <span className={`font-semibold ${
                    transactionInfo.type === 'RECEIVED' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transactionInfo.type}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount:</span>
                  <span className="text-gray-900 font-semibold">
                    {transactionInfo.amount.toLocaleString()} sats
                    <span className="text-gray-500 ml-2">
                      ({formatSats(transactionInfo.amount)})
                    </span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-semibold ${
                    transactionInfo.settled ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {transactionInfo.settled ? 'Settled' : 'Pending'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span className="text-gray-900">
                    {formatDate(new Date(transactionInfo.createdAt).toISOString())}
                  </span>
                </div>
              </div>
              <div className="mt-3 p-2 bg-blue-100 rounded text-xs text-blue-800">
                <strong>Note:</strong> This is an Ark Transaction ID. It may contain multiple VTXOs. 
                The individual VTXOs created by this transaction have their own unique TXIDs.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
