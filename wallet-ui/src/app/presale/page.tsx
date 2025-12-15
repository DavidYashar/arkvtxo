'use client';

import { useState, useEffect } from 'react';
import { Coins, Search, TrendingUp, Wallet, ShoppingCart, Clock, Users } from 'lucide-react';
import { getWallet } from '@/lib/wallet';
import { wsService } from '@/lib/websocket';
import { useToast } from '@/lib/toast';

interface PresaleToken {
  tokenId: string;
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  batchAmount: string;
  priceInSats: string;
  maxPurchasesPerWallet: number;
  totalBatchesSold: number;
  totalTokensSold: string;
  progressPercent: number;
  totalPurchases: number;
}

interface UserPurchases {
  totalBatches: number;
  totalPaid: string;
  purchases: any[];
}

export default function PresalePage() {
  const toast = useToast();
  const [txid, setTxid] = useState('');
  const [loading, setLoading] = useState(false);
  const [presaleToken, setPresaleToken] = useState<PresaleToken | null>(null);
  const [fetchingToken, setFetchingToken] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [userPurchases, setUserPurchases] = useState<UserPurchases | null>(null);
  const [batchesToBuy, setBatchesToBuy] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  
  // Round-based purchase state
  const [roundCountdown, setRoundCountdown] = useState<number | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [totalPending, setTotalPending] = useState<number>(0);
  const [purchaseRequestId, setPurchaseRequestId] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  
  // TWO-PHASE PAYMENT: Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<{
    requestId: string;
    amount: string;
    creatorAddress: string;
    timeoutSeconds: number;
  } | null>(null);
  const [paymentCountdown, setPaymentCountdown] = useState<number>(15);
  const [sendingPayment, setSendingPayment] = useState(false);
  const [rejectedRequestIds, setRejectedRequestIds] = useState<Set<string>>(new Set());

  // Helper function to format token amounts with decimals
  const formatTokenAmount = (amount: string | bigint, decimals: number): string => {
    const amountBigInt = typeof amount === 'string' ? BigInt(amount) : amount;
    const divisor = BigInt(10 ** decimals);
    const integerPart = amountBigInt / divisor;
    const fractionalPart = amountBigInt % divisor;
    
    if (fractionalPart === BigInt(0)) {
      return integerPart.toString();
    }
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    return `${integerPart}.${trimmedFractional}`;
  };

  // Fetch active pre-sale tokens on mount
  useEffect(() => {
    fetchPresaleToken();
    checkWallet();
  }, []);

  // Check wallet and fetch user purchases when token changes
  useEffect(() => {
    if (presaleToken && walletAddress) {
      fetchUserPurchases();
      fetchPurchaseHistory();
    }
  }, [presaleToken, walletAddress]);

  // WebSocket: Join rooms when connected
  useEffect(() => {
    if (presaleToken && walletAddress) {
      wsService.joinToken(presaleToken.tokenId);
      wsService.joinWallet(walletAddress);

      return () => {
        wsService.leaveToken(presaleToken.tokenId);
        wsService.leaveWallet(walletAddress);
      };
    }
  }, [presaleToken, walletAddress]);

  // WebSocket: Listen for round countdown
  useEffect(() => {
    if (!presaleToken) return;

    const unsubscribe = wsService.onRoundCountdown((data) => {
      if (data.tokenId === presaleToken.tokenId) {
        setRoundCountdown(data.secondsRemaining);
        setTotalPending(data.totalPending);
      }
    });

    return unsubscribe;
  }, [presaleToken]);

  // WebSocket: Listen for purchase confirmations
  useEffect(() => {
    if (!walletAddress) return;

    const unsubscribe = wsService.onPurchaseConfirmed((data) => {
      console.log('✅ Purchase confirmed:', data);
      setShowSuccessModal(true);
      setPurchaseRequestId(null);
      setQueuePosition(null);
      
      // Refresh data
      fetchPresaleToken();
      fetchUserPurchases();
      fetchPurchaseHistory();
    });

    return unsubscribe;
  }, [walletAddress]);

  // WebSocket: Listen for purchase rejections
  useEffect(() => {
    if (!walletAddress) return;

    const unsubscribe = wsService.onPurchaseRejected((data) => {
      console.log('❌ Purchase rejected:', data);
      
      // Add to rejected list to prevent reopening
      setRejectedRequestIds(prev => new Set(prev).add(data.requestId));
      
      setRejectionReason(data.reason);
      setShowRejectionModal(true);
      setPurchaseRequestId(null);
      setQueuePosition(null);
      setPurchasing(false);
      setShowPaymentModal(false); // Close payment modal if open
      setPaymentRequest(null);
      
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        setShowRejectionModal(false);
      }, 3000);
    });

    return unsubscribe;
  }, [walletAddress]);

  // WebSocket: Listen for payment-requested events (Phase 1 complete: now pay!)
  useEffect(() => {
    if (!walletAddress) return;

    const unsubscribe = wsService.onPaymentRequested((data) => {
      console.log('💳 Payment requested:', data);
      
      // Ignore if this request was already rejected
      if (rejectedRequestIds.has(data.requestId)) {
        console.log('⏭️  Request already rejected, ignoring payment-requested event');
        return;
      }
      
      // Only show modal if not already showing for this request
      // This prevents countdown reset when backend re-emits
      if (showPaymentModal && paymentRequest?.requestId === data.requestId) {
        console.log('⏭️  Payment modal already showing for this request, ignoring duplicate');
        return;
      }
      
      // Show payment modal
      setPaymentRequest({
        requestId: data.requestId,
        amount: data.amount,
        creatorAddress: data.creatorAddress,
        timeoutSeconds: data.timeoutSeconds
      });
      setPaymentCountdown(data.timeoutSeconds);
      setShowPaymentModal(true);
      setPurchasing(false); // Allow user to manually pay
    });

    return unsubscribe;
  }, [walletAddress, showPaymentModal, paymentRequest, rejectedRequestIds]);

  // Payment modal countdown timer
  useEffect(() => {
    if (!showPaymentModal || paymentCountdown <= 0 || !paymentRequest) return;

    const timer = setInterval(() => {
      setPaymentCountdown(prev => {
        if (prev <= 1) {
          // Timeout expired - auto-cancel the request
          console.log('⏰ Payment window expired, auto-canceling...');
          
          // Call cancel API
          const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
          fetch(`${indexerUrl}/api/presale/cancel-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId: paymentRequest.requestId }),
          }).then(() => {
            console.log('✅ Auto-canceled payment request');
          }).catch(err => {
            console.error('❌ Auto-cancel failed:', err);
          });
          
          // Close modal immediately
          setShowPaymentModal(false);
          setPaymentRequest(null);
          
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showPaymentModal, paymentCountdown, paymentRequest]);

  const checkWallet = async () => {
    try {
      const wallet = getWallet();
      if (wallet) {
        const address = await wallet.getAddress();
        setWalletAddress(address);
      }
    } catch (error) {
      console.error('Error checking wallet:', error);
    }
  };

  const fetchPresaleToken = async () => {
    try {
      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      const response = await fetch(`${indexerUrl}/api/presale/tokens`);
      const data = await response.json();
      
      if (data.tokens && data.tokens.length > 0) {
        // Get the first (most recent) pre-sale token
        const token = data.tokens[0];
        
        // Fetch progress data
        const progressResponse = await fetch(`${indexerUrl}/api/presale/${token.id}/progress`);
        const progressData = await progressResponse.json();
        
        setPresaleToken(progressData);
      }
    } catch (error) {
      console.error('Error fetching pre-sale token:', error);
    } finally {
      setFetchingToken(false);
    }
  };

  const fetchUserPurchases = async () => {
    if (!presaleToken || !walletAddress) return;

    try {
      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      const response = await fetch(`${indexerUrl}/api/presale/${presaleToken.tokenId}/purchases/${walletAddress}`);
      const data = await response.json();
      setUserPurchases(data);
    } catch (error) {
      console.error('Error fetching user purchases:', error);
    }
  };

  const fetchPurchaseHistory = async () => {
    if (!presaleToken || !walletAddress) return;

    try {
      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      const response = await fetch(`${indexerUrl}/api/presale/${presaleToken.tokenId}/all-purchases`);
      const data = await response.json();
      // Filter purchases to show only current wallet's transactions
      const myPurchases = (data.purchases || []).filter((p: any) => p.walletAddress === walletAddress);
      setPurchaseHistory(myPurchases);
    } catch (error) {
      console.error('Error fetching purchase history:', error);
    }
  };

  const handlePurchase = async () => {
    if (!presaleToken || !walletAddress || batchesToBuy < 1) return;

    // Check if user would exceed their personal limit
    const currentBatches = userPurchases?.totalBatches || 0;
    if (currentBatches + batchesToBuy > presaleToken.maxPurchasesPerWallet) {
      toast.show(`You can only purchase ${presaleToken.maxPurchasesPerWallet - currentBatches} more batch(es). You've already purchased ${currentBatches}.`, 'warning', 5000);
      return;
    }

    // Check if purchase would exceed total supply
    const tokensPerBatch = BigInt(presaleToken.batchAmount);
    const requestedTokens = tokensPerBatch * BigInt(batchesToBuy);
    const totalSold = BigInt(presaleToken.totalTokensSold);
    const totalSupply = BigInt(presaleToken.totalSupply);
    const remainingSupply = totalSupply - totalSold;

    if (requestedTokens > remainingSupply) {
      const maxBatches = Number(remainingSupply / tokensPerBatch);
      const remainingTokensFormatted = formatTokenAmount(remainingSupply, presaleToken.decimals);
      
      if (maxBatches === 0) {
        toast.show('Pre-sale Sold Out! All tokens have been sold. No more purchases are available.', 'warning', 5000);
        return;
      }
      
      toast.show(
        `Purchase exceeds supply! Available: ${remainingTokensFormatted} ${presaleToken.symbol}. Maximum batches: ${maxBatches}. Please reduce your amount.`,
        'warning',
        6000
      );
      return;
    }

    setPurchasing(true);
    try {
      const wallet = getWallet();
      if (!wallet) {
        toast.show('Please connect your wallet first', 'warning', 4000);
        setPurchasing(false);
        return;
      }

      // ============================================================================
      // CRITICAL: Real-time supply check RIGHT BEFORE payment
      // This prevents race conditions where supply is exhausted between UI check and payment
      // ============================================================================
      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      
      console.log(`🔍 Real-time supply check for ${batchesToBuy} batches...`);
      
      const supplyCheckResponse = await fetch(
        `${indexerUrl}/api/presale/check-supply/${presaleToken.tokenId}/${batchesToBuy}`
      );

      if (!supplyCheckResponse.ok) {
        throw new Error('Failed to check supply');
      }

      const supplyCheck = await supplyCheckResponse.json();
      
      if (!supplyCheck.available) {
        toast.show(
          `Supply Exhausted! ${supplyCheck.message}. Someone purchased just before you. Please refresh and try with fewer batches.`,
          'error',
          6000
        );
        setPurchasing(false);
        // Refresh data to show updated supply
        await fetchPresaleToken();
        return;
      }

      console.log('✅ Supply confirmed:', supplyCheck.message);

      const totalCost = BigInt(presaleToken.priceInSats) * BigInt(batchesToBuy);

      console.log('Submitting purchase request to queue (no payment yet):', {
        batches: batchesToBuy,
        totalCost: totalCost.toString(),
      });

      // TWO-PHASE PAYMENT: Submit to queue WITHOUT payment (Phase 1)
      // Payment will be requested via WebSocket after supply is confirmed
      const purchaseResponse = await fetch(`${indexerUrl}/api/presale/round-purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: presaleToken.tokenId,
          walletAddress,
          batchesPurchased: batchesToBuy,
          totalPaid: totalCost.toString(),
          // NO txid! Payment happens in Phase 2 after supply confirmed
        }),
      });

      if (!purchaseResponse.ok) {
        const error = await purchaseResponse.json();
        throw new Error(error.error || 'Failed to submit purchase request');
      }

      const result = await purchaseResponse.json();
      console.log('Purchase request submitted:', result);
      
      setPurchaseRequestId(result.requestId);
      setQueuePosition(result.queuePosition);
      
      // Don't show immediate success - wait for WebSocket confirmation
      // User will see queue position and countdown
      setBatchesToBuy(1);
    } catch (error: any) {
      console.error('Purchase error:', error);
      toast.show('Purchase failed: ' + error.message, 'error', 5000);
    } finally {
      setPurchasing(false);
    }
  };

  // TWO-PHASE PAYMENT Phase 2: Send payment after supply confirmed
  const handlePayment = async () => {
    if (!paymentRequest) return;

    setSendingPayment(true);
    try {
      console.log('💸 Sending payment...', paymentRequest);

      // Get the underlying Arkade wallet to send Bitcoin
      const { getArkadeWallet } = await import('@/lib/wallet');
      const arkadeWallet = getArkadeWallet();
      
      if (!arkadeWallet) {
        throw new Error('Arkade wallet not initialized');
      }
      
      // Send payment via Arkade
      const txid = await arkadeWallet.sendBitcoin({
        address: paymentRequest.creatorAddress,
        amount: Number(paymentRequest.amount),
      });
      
      console.log('✅ Payment sent! TXID:', txid);

      // Submit payment to backend
      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      const response = await fetch(`${indexerUrl}/api/presale/submit-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: paymentRequest.requestId,
          txid
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit payment');
      }

      const result = await response.json();
      console.log('Payment submitted:', result);

      // Close modal and wait for verification
      setShowPaymentModal(false);
      toast.show('Payment sent! Waiting for verification...', 'success', 4000);

    } catch (error: any) {
      console.error('Payment error:', error);
      toast.show('Payment failed: ' + error.message, 'error', 5000);
    } finally {
      setSendingPayment(false);
    }
  };

  // TWO-PHASE PAYMENT: Cancel payment request
  const handleCancelPayment = async () => {
    if (!paymentRequest) return;

    try {
      console.log('❌ Canceling payment request...', paymentRequest.requestId);

      const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
      const response = await fetch(`${indexerUrl}/api/presale/cancel-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: paymentRequest.requestId
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel payment request');
      }

      console.log('✅ Payment request canceled');
      
      // Close modal
      setShowPaymentModal(false);
      setPaymentRequest(null);
      
      // Show notification
      toast.show('Payment request canceled. Supply has been freed for other users.', 'info', 4000);

    } catch (error: any) {
      console.error('Cancel error:', error);
      toast.show('Failed to cancel: ' + error.message, 'error', 4000);
    }
  };

  const handleSearch = async () => {
    if (!txid.trim()) return;
    
    setLoading(true);
    try {
      // Search in purchase history
      const purchase = purchaseHistory.find(p => p.txid === txid.trim());
      
      if (purchase) {
        const date = new Date(purchase.purchasedAt).toLocaleString();
        const walletShort = `${purchase.walletAddress.slice(0, 12)}...${purchase.walletAddress.slice(-8)}`;
        toast.show(
          `✓ Purchase Found! | Wallet: ${walletShort} | Batches: ${purchase.batchesPurchased} | Paid: ${purchase.totalPaid} sats | ${date}`,
          'success',
          8000
        );
      } else {
        toast.show('Transaction not found in this pre-sale. Please verify the transaction ID is correct.', 'warning', 5000);
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.show('Error searching for transaction.', 'error', 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100">
      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Icon */}
          <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
            <Coins className="w-12 h-12 text-white" />
          </div>

          {/* Title */}
          <h2 className="text-5xl font-bold text-blue-900 mb-6 text-center">
            VTXO Token Pre-Sale
          </h2>

          {/* Subtitle */}
          <p className="text-xl text-blue-700 mb-12 text-center">
            Check your transaction status
          </p>

          {/* Search Bar */}
          <div className="bg-white/80 backdrop-blur-sm border border-blue-300 rounded-2xl p-4 sm:p-8 shadow-lg mb-8">
            <label htmlFor="txid" className="block text-sm font-semibold text-blue-800 mb-3">
              Transaction ID (txid)
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="txid"
                type="text"
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Paste your transaction ID here..."
                className="flex-1 px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
              <button
                onClick={handleSearch}
                disabled={!txid.trim() || loading}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-800 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {loading ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                    <span className="hidden sm:inline">Searching...</span>
                    <span className="sm:hidden">Search</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Search
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active Pre-sale Token */}
          {fetchingToken ? (
            <div className="bg-white/80 backdrop-blur-sm border border-blue-300 rounded-2xl p-8 shadow-lg text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-blue-700">Loading pre-sale information...</p>
            </div>
          ) : presaleToken ? (
            <div className="bg-white/80 backdrop-blur-sm border border-blue-300 rounded-2xl p-8 shadow-lg mb-8">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-6 h-6 text-blue-700" />
                  <h3 className="text-2xl font-bold text-blue-900">
                    {presaleToken.name} ({presaleToken.symbol})
                  </h3>
                </div>
                <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 mt-2">
                  <p className="text-xs text-blue-700 mb-1 font-semibold">Full Token ID:</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono text-blue-900 break-all">{presaleToken.tokenId}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(presaleToken.tokenId);
                        toast.show('Token ID copied!', 'success', 2000);
                      }}
                      className="text-blue-700 hover:text-blue-900 transition-colors flex-shrink-0"
                      title="Copy Token ID"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-blue-800 font-medium">Sale Progress</span>
                  <span className="text-blue-900 font-bold">{presaleToken.progressPercent.toFixed(2)}%</span>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-800 transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(presaleToken.progressPercent, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-blue-700 mt-1">
                  <span>{formatTokenAmount(presaleToken.totalTokensSold, presaleToken.decimals)} tokens sold</span>
                  <span>{formatTokenAmount(presaleToken.totalSupply, presaleToken.decimals)} total supply</span>
                </div>
              </div>

              {/* Token Info */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                  <p className="text-xs text-blue-700 mb-1">Price per Batch</p>
                  <p className="text-lg font-bold text-blue-900">{presaleToken.priceInSats} sats</p>
                </div>
                <div className="bg-blue-100 border border-blue-400 rounded-lg p-4">
                  <p className="text-xs text-blue-800 mb-1">Tokens per Batch</p>
                  <p className="text-lg font-bold text-blue-950">{formatTokenAmount(presaleToken.batchAmount, presaleToken.decimals)}</p>
                </div>
                <div className="bg-blue-200 border border-blue-500 rounded-lg p-4">
                  <p className="text-xs text-blue-900 mb-1">Max per Wallet</p>
                  <p className="text-lg font-bold text-blue-950">{presaleToken.maxPurchasesPerWallet} batches</p>
                </div>
                <div className="bg-blue-300 border border-blue-600 rounded-lg p-4">
                  <p className="text-xs text-blue-950 mb-1">Total Purchases</p>
                  <p className="text-lg font-bold text-blue-950">{presaleToken.totalPurchases}</p>
                </div>
              </div>

              {/* Round Countdown Display */}
              {roundCountdown !== null && totalPending > 0 && (
                <div className="bg-gradient-to-r from-blue-100 to-blue-200 border-2 border-blue-400 rounded-lg p-5 mb-4 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="w-6 h-6 text-blue-700" />
                      <div>
                        <p className="text-sm font-semibold text-blue-900">Next Round</p>
                        <p className="text-xs text-blue-800">{totalPending} in queue</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-blue-900">{roundCountdown}s</p>
                      <p className="text-xs text-blue-800">remaining</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Queue Position Display */}
              {purchaseRequestId && queuePosition !== null && (
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-5 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Users className="w-6 h-6 text-yellow-600" />
                    <p className="text-sm font-semibold text-yellow-900">Your Request is Queued</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-600">Queue Position:</p>
                      <p className="text-2xl font-bold text-yellow-700">#{queuePosition}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Request ID:</p>
                      <p className="text-xs font-mono text-yellow-700 truncate">{purchaseRequestId}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-3">
                    Your purchase will be processed in the next round. You'll be notified when confirmed.
                  </p>
                </div>
              )}

              {/* User's Purchase Status */}
              {walletAddress ? (
                <>
                  {userPurchases && userPurchases.totalBatches > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className="w-4 h-4 text-blue-600" />
                        <p className="text-sm font-semibold text-blue-900">Your Purchases</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-600">Batches Purchased:</p>
                          <p className="font-bold text-blue-700">{userPurchases.totalBatches}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Total Paid:</p>
                          <p className="font-bold text-blue-700">{userPurchases.totalPaid} sats</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Purchase Interface */}
                  {(!userPurchases || userPurchases.totalBatches < presaleToken.maxPurchasesPerWallet) ? (
                    <div className="border-t-2 border-blue-200 pt-4">
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Number of Batches to Purchase
                        </label>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setBatchesToBuy(Math.max(1, batchesToBuy - 1))}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold text-gray-700 transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={presaleToken.maxPurchasesPerWallet - (userPurchases?.totalBatches || 0)}
                            value={batchesToBuy}
                            onChange={(e) => setBatchesToBuy(Math.max(1, parseInt(e.target.value) || 1))}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-center font-bold text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                          <button
                            onClick={() => setBatchesToBuy(Math.min(presaleToken.maxPurchasesPerWallet - (userPurchases?.totalBatches || 0), batchesToBuy + 1))}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold text-gray-700 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Cost Preview */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-xs text-gray-600">Total Cost</p>
                            <p className="text-2xl font-bold text-blue-900">
                              {(BigInt(presaleToken.priceInSats) * BigInt(batchesToBuy)).toString()} sats
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-600">You'll Receive</p>
                            <p className="text-2xl font-bold text-blue-900">
                              {formatTokenAmount(BigInt(presaleToken.batchAmount) * BigInt(batchesToBuy), presaleToken.decimals)} {presaleToken.symbol}
                            </p>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handlePurchase}
                        disabled={purchasing || batchesToBuy < 1}
                        className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg font-semibold text-lg shadow-lg hover:from-blue-700 hover:to-blue-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {purchasing ? (
                          <>
                            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                            Processing...
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-5 h-5" />
                            Purchase {batchesToBuy} Batch{batchesToBuy > 1 ? 'es' : ''}
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                      <p className="text-yellow-800 font-semibold">
                        You've reached the maximum purchase limit ({presaleToken.maxPurchasesPerWallet} batches)
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-yellow-800 font-semibold">Please connect your wallet to purchase using the Connect Wallet button in the header</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm border border-blue-300 rounded-2xl p-8 shadow-lg text-center mb-8">
              <p className="text-blue-800 text-lg">
                No active pre-sale tokens at this time.
              </p>
            </div>
          )}

          {/* Purchase History */}
          {presaleToken && walletAddress && purchaseHistory.length > 0 && (
            <div className="bg-white/80 backdrop-blur-sm border border-blue-300 rounded-2xl p-8 shadow-lg mb-8">
              <h3 className="text-2xl font-bold text-blue-900 mb-6">My Purchase History</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {purchaseHistory.map((purchase: any, index: number) => (
                  <div
                    key={index}
                    className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-300 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Wallet className="w-4 h-4 text-blue-700" />
                          <p className="text-sm font-semibold text-blue-900">
                            {purchase.walletAddress.slice(0, 12)}...{purchase.walletAddress.slice(-8)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-blue-700">Batches:</p>
                            <p className="font-bold text-blue-900">{purchase.batchesPurchased}</p>
                          </div>
                          <div>
                            <p className="text-blue-700">Amount:</p>
                            <p className="font-bold text-blue-900">{purchase.totalPaid} sats</p>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-blue-300">
                          <p className="text-xs text-blue-700 mb-1">Transaction ID:</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-mono text-blue-900 break-all">{purchase.txid}</p>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(purchase.txid);
                                toast.show('Transaction ID copied!', 'success', 2000);
                              }}
                              className="text-blue-700 hover:text-blue-900 transition-colors"
                              title="Copy TXID"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          {new Date(purchase.purchasedAt || Date.now()).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="bg-white/80 backdrop-blur-sm border border-blue-300 rounded-2xl p-8 shadow-lg text-center">
            <p className="text-blue-800 text-lg">
              Enter your transaction ID in the top bar to check your pre-sale participation status.
            </p>
          </div>
        </div>
      </div>

      {/* Payment Request Modal - TWO-PHASE PAYMENT Phase 2 */}
      {showPaymentModal && paymentRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-blue-900 mb-2">Supply Confirmed! 💰</h3>
              <p className="text-blue-700 mb-4">
                Your purchase is approved. Please send payment now to complete.
              </p>
              
              <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-4 text-left">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-blue-700">Amount:</span>
                  <span className="text-sm font-bold text-blue-900">{Number(paymentRequest.amount).toLocaleString()} sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">To:</span>
                  <span className="text-xs font-mono text-blue-900">{paymentRequest.creatorAddress.slice(0, 20)}...</span>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-800 font-medium flex items-center justify-center">
                  <Clock className="w-4 h-4 mr-2" />
                  Time remaining: <span className="font-bold ml-1">{paymentCountdown}s</span>
                </p>
              </div>

              <button
                onClick={handlePayment}
                disabled={sendingPayment}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-700 to-blue-800 text-white rounded-lg font-semibold hover:from-blue-800 hover:to-blue-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-3"
              >
                {sendingPayment ? 'Sending Payment...' : 'Pay Now'}
              </button>

              <button
                onClick={handleCancelPayment}
                disabled={sendingPayment}
                className="w-full px-6 py-2 text-blue-700 hover:text-blue-900 transition-colors text-sm"
              >
                Cancel (will reject purchase)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-bounce-in">
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Purchase Confirmed!</h3>
              <p className="text-gray-600 mb-6">
                Your purchase has been successfully processed and confirmed.
              </p>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg font-semibold hover:from-green-700 hover:to-green-800 transition-all"
              >
                Awesome!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Purchase Not Processed</h3>
              <p className="text-gray-600 mb-4">
                Your purchase request could not be completed:
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-800 font-medium">{rejectionReason}</p>
              </div>
              <button
                onClick={() => {
                  setShowRejectionModal(false);
                  setPurchasing(false);
                }}
                className="w-full px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg font-semibold hover:from-gray-700 hover:to-gray-800 transition-all"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
