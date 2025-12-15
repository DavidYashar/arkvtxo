'use client';

import { useState } from 'react';
import { getArkadeWallet } from '@/lib/wallet';
import { Send, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export default function SendBitcoin() {
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setTxid(null);
    setLoading(true);

    try {
      const wallet = getArkadeWallet();
      if (!wallet) {
        throw new Error('Wallet not connected');
      }

      if (!recipientAddress) {
        throw new Error('Please enter a recipient address');
      }

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Please enter a valid amount');
      }

      // Validate Arkade address format (should start with 'tark' for testnet or 'ark' for mainnet)
      if (!recipientAddress.startsWith('tark') && !recipientAddress.startsWith('ark')) {
        throw new Error('Invalid Arkade address. Address should start with "tark" or "ark"');
      }

      const amountSats = Math.floor(parseFloat(amount));
      
      // Check balance
      const balance = await wallet.getBalance();
      const availableBalance = balance.available || 0;
      
      if (!availableBalance || amountSats > availableBalance) {
        throw new Error(`Insufficient balance. Available: ${availableBalance.toLocaleString()} sats`);
      }

      console.log('Sending Bitcoin on Arkade L2:', {
        to: recipientAddress,
        amount: amountSats,
      });

      // Send Bitcoin offchain using Arkade
      // The sendBitcoin method creates a virtual transaction that transfers VTXOs
      const txid = await wallet.sendBitcoin({
        address: recipientAddress,
        amount: amountSats,
      });

      console.log('Send successful! TXID:', txid);

      setTxid(txid);
      setSuccess(`Successfully sent ${amountSats.toLocaleString()} sats to ${recipientAddress.slice(0, 12)}...${recipientAddress.slice(-8)}`);
      
      // Reset form
      setRecipientAddress('');
      setAmount('');

    } catch (err: any) {
      console.error('Send error:', err);
      setError(err.message || 'Failed to send Bitcoin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 border border-blue-300 rounded-lg bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Send className="w-6 h-6 text-blue-700" />
        <h3 className="text-xl font-semibold text-blue-900">Send Bitcoin (Arkade L2)</h3>
      </div>

      {/* Info Banner */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-300 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>Instant transfers:</strong> Send Bitcoin to other Arkade wallets instantly with no on-chain fees. 
          Transactions are settled offchain with instant confirmation.
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-3 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-green-800">{success}</div>
          </div>
          {txid && txid !== 'pending' && (
            <div className="mt-2 pt-2 border-t border-green-200">
              <p className="text-xs text-green-700">
                <strong>Transaction ID:</strong>
              </p>
              <p className="text-xs text-green-900 font-mono break-all mt-1">{txid}</p>
            </div>
          )}
        </div>
      )}

      {/* Send Form */}
      <form onSubmit={handleSend} className="space-y-4">
        {/* Recipient Address */}
        <div>
          <label className="block text-sm font-medium text-blue-800 mb-2">
            Recipient Arkade Address
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="tark1q..."
            className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            disabled={loading}
          />
          <p className="text-xs text-blue-600 mt-1">
            Enter the recipient's Arkade address (starts with "tark" or "ark")
          </p>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-blue-800 mb-2">
            Amount (satoshis)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10000"
            min="1"
            step="1"
            className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
          <p className="text-xs text-blue-600 mt-1">
            {amount && parseFloat(amount) > 0 
              ? `≈ ${(parseFloat(amount) / 100000000).toFixed(8)} BTC`
              : 'Enter amount in satoshis (1 BTC = 100,000,000 sats)'}
          </p>
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={loading || !recipientAddress || !amount}
          className="w-full bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Send Bitcoin
            </>
          )}
        </button>
      </form>

      {/* Footer Info */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-300 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>How it works:</strong> Arkade L2 transfers are instant and free. Your Bitcoin stays secure 
          while being transferred as Virtual Transaction Outputs (VTXOs) between Arkade addresses. 
          The recipient can spend immediately or withdraw to Layer 1 anytime.
        </p>
      </div>
    </div>
  );
}
