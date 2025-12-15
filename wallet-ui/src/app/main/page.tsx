'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Zap, Coins, Shield, Link as LinkIcon } from 'lucide-react';

export default function MainPage() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Check if wallet is connected
    const key = sessionStorage.getItem('arkade_private_key');
    setIsConnected(!!key);
  }, []);

  const handleGetStarted = () => {
    if (isConnected) {
      router.push('/');
    } else {
      // Go to root page to show wallet connect
      router.push('/');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 text-white">
      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-20 pb-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-4 py-2 bg-blue-800/50 rounded-full border border-blue-600/30">
            <p className="text-sm font-medium text-blue-200">Bitcoin Layer 2 Token Protocol</p>
          </div>
          
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-200 to-white bg-clip-text text-transparent leading-tight">
            Arkade Token Platform
          </h1>
          
          <p className="text-xl sm:text-2xl text-blue-100 mb-8 max-w-2xl mx-auto leading-relaxed">
            Create, transfer, and manage tokens on Bitcoin with instant finality and zero transaction fees
          </p>

          <button
            onClick={handleGetStarted}
            className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 rounded-lg font-semibold text-lg shadow-xl shadow-blue-900/50 transition-all duration-200 hover:scale-105"
          >
            {isConnected ? 'Go to Dashboard' : 'Connect Wallet to Start'}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>

          {!isConnected && (
            <p className="mt-4 text-sm text-blue-300">
              Click "Connect Wallet" in the header to get started
            </p>
          )}
        </div>
      </section>

      {/* Bitcoin Stack Visualization */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            Built on Bitcoin
          </h2>
          <p className="text-center text-blue-200 mb-12 text-lg">
            Three layers working together for instant, secure token transfers
          </p>

          {/* Stack Layers */}
          <div className="space-y-4">
            {/* Layer 3: Token Layer */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg blur-xl group-hover:blur-2xl transition-all duration-300"></div>
              <div className="relative bg-gradient-to-r from-purple-600 to-blue-600 p-6 sm:p-8 rounded-lg border border-purple-400/30 hover:border-purple-400/50 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white/10 rounded-lg">
                    <Coins className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold">Token Layer</h3>
                      <span className="px-3 py-1 bg-purple-500/30 rounded-full text-xs font-medium">Layer 3</span>
                    </div>
                    <p className="text-blue-100 mb-3">
                      Token creation, transfers, and management with instant finality
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-white/10 rounded-full text-sm">OP_RETURN Registry</span>
                      <span className="px-3 py-1 bg-white/10 rounded-full text-sm">Instant Transfers</span>
                      <span className="px-3 py-1 bg-white/10 rounded-full text-sm">Zero Fees</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 2: Ark Protocol */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-lg blur-xl group-hover:blur-2xl transition-all duration-300"></div>
              <div className="relative bg-gradient-to-r from-blue-600 to-cyan-600 p-6 sm:p-8 rounded-lg border border-blue-400/30 hover:border-blue-400/50 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white/10 rounded-lg">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold">Ark Protocol</h3>
                      <span className="px-3 py-1 bg-blue-500/30 rounded-full text-xs font-medium">Layer 2</span>
                    </div>
                    <p className="text-blue-100 mb-3">
                      Virtual UTXOs (vTXOs) enable instant, off-chain Bitcoin transfers
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-white/10 rounded-full text-sm">vTXO Management</span>
                      <span className="px-3 py-1 bg-white/10 rounded-full text-sm">Board/Withdraw</span>
                      <span className="px-3 py-1 bg-white/10 rounded-full text-sm">Instant Settlement</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 1: Bitcoin */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-lg blur-xl group-hover:blur-2xl transition-all duration-300"></div>
              <div className="relative bg-gradient-to-r from-orange-600 to-yellow-600 p-6 sm:p-8 rounded-lg border border-orange-400/30 hover:border-orange-400/50 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white/10 rounded-lg">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold">Bitcoin</h3>
                      <span className="px-3 py-1 bg-orange-500/30 rounded-full text-xs font-medium">Layer 1</span>
                    </div>
                    <p className="text-orange-100 mb-3">
                      The most secure blockchain providing final settlement and data availability
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-white/10 rounded-full text-sm">Final Settlement</span>
                      <span className="px-3 py-1 bg-white/10 rounded-full text-sm">Data Anchoring</span>
                      <span className="px-3 py-1 bg-white/10 rounded-full text-sm">Security</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            Why Build on Arkade?
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-blue-900/30 backdrop-blur-sm p-6 rounded-lg border border-blue-700/30 hover:border-blue-600/50 transition-all duration-300 hover:scale-105">
              <div className="p-3 bg-blue-600/30 rounded-lg w-fit mb-4">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Instant Finality</h3>
              <p className="text-blue-200">
                Token transfers settle immediately with no waiting for confirmations
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-blue-900/30 backdrop-blur-sm p-6 rounded-lg border border-blue-700/30 hover:border-blue-600/50 transition-all duration-300 hover:scale-105">
              <div className="p-3 bg-blue-600/30 rounded-lg w-fit mb-4">
                <Coins className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Zero Transfer Fees</h3>
              <p className="text-blue-200">
                Move tokens between users without paying transaction fees
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-blue-900/30 backdrop-blur-sm p-6 rounded-lg border border-blue-700/30 hover:border-blue-600/50 transition-all duration-300 hover:scale-105">
              <div className="p-3 bg-blue-600/30 rounded-lg w-fit mb-4">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Bitcoin Security</h3>
              <p className="text-blue-200">
                All token data anchored on Bitcoin blockchain for immutability
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-blue-900/30 backdrop-blur-sm p-6 rounded-lg border border-blue-700/30 hover:border-blue-600/50 transition-all duration-300 hover:scale-105">
              <div className="p-3 bg-blue-600/30 rounded-lg w-fit mb-4">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Non-Custodial</h3>
              <p className="text-blue-200">
                You control your private keys. Your tokens, your custody.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-blue-900/30 backdrop-blur-sm p-6 rounded-lg border border-blue-700/30 hover:border-blue-600/50 transition-all duration-300 hover:scale-105">
              <div className="p-3 bg-blue-600/30 rounded-lg w-fit mb-4">
                <LinkIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">OP_RETURN Registry</h3>
              <p className="text-blue-200">
                Transparent token registry stored on Bitcoin via OP_RETURN
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-blue-900/30 backdrop-blur-sm p-6 rounded-lg border border-blue-700/30 hover:border-blue-600/50 transition-all duration-300 hover:scale-105">
              <div className="p-3 bg-blue-600/30 rounded-lg w-fit mb-4">
                <Coins className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Flexible Tokens</h3>
              <p className="text-blue-200">
                Create tokens with custom supply, symbols, and decimal precision
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-blue-800/50 to-blue-900/50 backdrop-blur-sm p-12 rounded-2xl border border-blue-600/30">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-blue-200 mb-8 max-w-2xl mx-auto">
            Connect your wallet and start creating tokens on Bitcoin today
          </p>
          <button
            onClick={handleGetStarted}
            className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 rounded-lg font-semibold text-lg shadow-xl shadow-blue-900/50 transition-all duration-200 hover:scale-105"
          >
            {isConnected ? 'Go to Dashboard' : 'Connect Wallet'}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-blue-800 mt-16 bg-blue-950/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-blue-300 text-sm">
            <p className="mb-2 font-medium">Arkade Token Platform - Bitcoin Layer 2 Token Protocol</p>
            <p className="text-xs text-blue-400">
              Tokens are tracked via OP_RETURN outputs on Bitcoin blockchain
            </p>
            <div className="mt-4 flex items-center justify-center gap-6">
              <a
                href="https://arkade.io"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-100 transition-colors font-medium"
              >
                Documentation
              </a>
              <span>•</span>
              <a
                href={`${process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001'}/health`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-100 transition-colors font-medium"
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
