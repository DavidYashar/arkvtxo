'use client';

import { Store, Sparkles, TrendingUp, Users, Zap } from 'lucide-react';
import Link from 'next/link';

export default function MarketplacePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full mb-6 animate-pulse">
              <Store className="w-12 h-12 text-white" />
            </div>
            
            <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-600 via-blue-700 to-blue-900 bg-clip-text text-transparent mb-4">
              Marketplace
            </h1>
            
            <div className="inline-block">
              <p className="text-4xl font-bold text-blue-900 mb-2">
                Coming Soon!
              </p>
              <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-700 to-blue-900 rounded-full"></div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-300 p-8 mb-8">
            <p className="text-xl text-blue-800 text-center leading-relaxed mb-6">
              The Arkade Token Marketplace is under development. Soon you'll be able to discover, trade, and manage tokens from the Arkade ecosystem.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              {/* Feature 1 */}
              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-300">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">Buy & Sell Tokens</h3>
                  <p className="text-sm text-blue-700">Trade tokens directly with other users using Arkade's instant settlement</p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex items-start gap-4 p-4 bg-blue-100 rounded-lg border border-blue-400">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-700 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-950 mb-1">Discover New Tokens</h3>
                  <p className="text-sm text-blue-800">Explore trending tokens and find new opportunities in the ecosystem</p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="flex items-start gap-4 p-4 bg-blue-200 rounded-lg border border-blue-500">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-800 rounded-lg flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-950 mb-1">Instant Transactions</h3>
                  <p className="text-sm text-blue-900">Leverage Arkade Layer 2 for fast, cheap token trades</p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="flex items-start gap-4 p-4 bg-blue-300 rounded-lg border border-blue-600">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-950 mb-1">Community Driven</h3>
                  <p className="text-sm text-blue-950">Built for the community, by the community</p>
                </div>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl shadow-xl p-8 text-center text-white">
            <h2 className="text-2xl font-bold mb-3">Want to be notified when we launch?</h2>
            <p className="text-blue-100 mb-6">
              Stay tuned for updates on our marketplace launch
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="px-8 py-3 bg-white text-blue-700 rounded-lg font-semibold hover:bg-blue-50 transition-colors shadow-lg"
              >
                Back to Wallet
              </Link>
              <button
                disabled
                className="px-8 py-3 bg-blue-800 text-white rounded-lg font-semibold opacity-50 cursor-not-allowed"
              >
                Join Waitlist (Coming Soon)
              </button>
            </div>
          </div>

          {/* Timeline Hint */}
          <div className="mt-8 text-center">
            <p className="text-blue-700 text-sm font-medium">
              🚀 Expected Launch: Q1 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
