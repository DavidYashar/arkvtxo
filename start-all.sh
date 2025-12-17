#!/bin/bash

echo "Starting Arkade Token Platform..."
echo ""
echo "This will start 2 services:"
echo "  1. Token Indexer (port 3002)"
echo "  2. Wallet UI (port 3000)"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Trap Ctrl+C to kill all background processes
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Start indexer
echo "Starting Token Indexer..."
cd token-indexer && npm run dev &
INDEXER_PID=$!

# Wait for indexer to start
sleep 3

# Start wallet UI
echo "Starting Wallet UI..."
cd wallet-ui && npm run dev &
WALLET_PID=$!

# Wait for both processes
wait
