/**
 * REST API server for token indexer
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { ArkadeClient } from '../services/arkadeClient';
import { 
  queryVtxosViaSdk, 
  queryBalanceViaSdk, 
  queryHistoryViaSdk, 
  getAddressViaSdk,
  verifyVtxoViaSdk,
  getVtxoInfoViaSdk
} from '../services/arkSdk';
import verifyTokenRouter from './verifyToken';
import { 
  PRESALE_POOL_CONFIG, 
  PRESALE_POOL_WALLETS,
  getNextAvailablePoolWallet, 
  updatePoolWalletVolume,
  getPoolWalletStats,
  checkAndRotateIfNeeded
} from '../config/presale-pool';

const prisma = new PrismaClient();

// Initialize Arkade client for VTXO verification
const arkadeClient = new ArkadeClient(
  process.env.ARKADE_ASP_URL || 'https://arkade.computer'
);

// Global WebSocket instance for real-time notifications
let globalIO: SocketIOServer | null = null;

export function getIO(): SocketIOServer | null {
  return globalIO;
}

/**
 * Setup WebSocket connection handling
 */
function setupWebSocket(io: SocketIOServer) {
  // WebSocket Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const expectedToken = process.env.WS_AUTH_TOKEN || process.env.API_KEY;

    // If no auth token configured, allow (backward compatibility)
    if (!expectedToken) {
      logger.warn('⚠️  WS_AUTH_TOKEN not configured - WebSocket authentication disabled');
      return next();
    }

    // Verify token
    if (!token) {
      logger.warn({ socketId: socket.id }, '⚠️  WebSocket connection without auth token - allowing for now');
      return next(); // Allow for now, will enforce later
    }
    
    if (token !== expectedToken) {
      logger.warn({ socketId: socket.id }, '❌ Unauthorized WebSocket connection attempt - invalid token');
      return next(new Error('Unauthorized - Invalid token'));
    }

    logger.info({ socketId: socket.id }, '✅ WebSocket authenticated');
    next();
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, '🔌 WebSocket client connected');

    // Join wallet room (for personal notifications)
    socket.on('join-wallet', (walletAddress: string) => {
      socket.join(`wallet:${walletAddress}`);
      // Removed noisy log
    });

    // Join token room (for token-specific updates)
    socket.on('join-token', (tokenId: string) => {
      socket.join(`token:${tokenId}`);
      // Removed noisy log
    });

    // Leave wallet room
    socket.on('leave-wallet', (walletAddress: string) => {
      socket.leave(`wallet:${walletAddress}`);
      // Removed noisy log
    });

    // Leave token room
    socket.on('leave-token', (tokenId: string) => {
      socket.leave(`token:${tokenId}`);
      // Removed noisy log
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, '🔌 WebSocket client disconnected');
    });
  });

  // Initialize round timer with Socket.IO
  import('../queue/roundTimer').then(({ roundTimer }) => {
    roundTimer.initialize(io);
    logger.info('⏱️  Round Timer initialized with WebSocket');
  }).catch((error) => {
    logger.error({ error: error.message }, 'Failed to initialize Round Timer');
  });

  logger.info(' WebSocket setup complete');
}

export function createApiServer() {
  const app = express();
  const httpServer = createServer(app);

  // Initialize Socket.IO with CORS
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.WALLET_UI_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Store global reference for token monitor
  globalIO = io;

  // Setup WebSocket connection handling
  setupWebSocket(io);

  // Trust proxy - required for rate limiting behind Render's proxy
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", process.env.WALLET_UI_URL || 'https://www.arkvtxo.com'],
      },
    },
  }));

  // CORS - restrict to production domain only
  app.use(cors({
    origin: process.env.WALLET_UI_URL || 'https://www.arkvtxo.com',
    credentials: true,
    methods: ['GET', 'POST']
  }));

  // Rate limiting - prevent abuse (generous for normal wallet usage)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per 15min (allows active wallet usage)
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', apiLimiter);

  // Stricter rate limit for token creation
  const tokenCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // limit each IP to 10 token creations per hour
    message: { error: 'Too many token creation attempts, please try again later.' },
  });

  // Body parsing with size limit
  app.use(express.json({ limit: '10kb' }));

  // API Key Authentication Middleware
  const apiKeyAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Skip auth for health check
    if (req.path === '/health') {
      return next();
    }

    const apiKey = req.headers['x-api-key'] as string;
    const expectedKey = process.env.API_KEY;

    // If API_KEY not configured, allow (backward compatibility)
    if (!expectedKey) {
      logger.warn('⚠️  API_KEY not configured - authentication disabled');
      return next();
    }

    if (!apiKey || apiKey !== expectedKey) {
      logger.warn({ path: req.path, ip: req.ip }, 'Unauthorized API access attempt');
      return res.status(401).json({ error: 'Unauthorized - Invalid API key' });
    }

    next();
  };

  // Apply API key auth to all /api routes
  app.use('/api', apiKeyAuth);

  // Mount verification router
  app.use('/api', verifyTokenRouter);

  // Health check (public)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Check if address is whitelisted for token creation
  app.get('/api/whitelist/check/:address', (req, res) => {
    try {
      const { address } = req.params;
      
      // Get whitelisted addresses from environment
      const whitelistedAddresses = process.env.WHITELISTED_ADDRESSES?.split(',').map(addr => addr.trim()) || [];
      const isWhitelisted = whitelistedAddresses.includes(address);
      
      res.json({ 
        address, 
        isWhitelisted,
        message: isWhitelisted ? 'Address is whitelisted' : 'Address is not whitelisted'
      });
    } catch (error) {
      logger.error({ error }, 'Error checking whitelist');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get token by ID
  app.get('/api/tokens/:tokenId', async (req, res) => {
    try {
      const token = await prisma.token.findUnique({
        where: { id: req.params.tokenId },
      });

      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      res.json(token);
    } catch (error) {
      logger.error({ error }, 'Error fetching token');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get all tokens
  app.get('/api/tokens', async (req, res) => {
    try {
      const tokens = await prisma.token.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      res.json({ tokens });
    } catch (error) {
      logger.error({ error }, 'Error fetching tokens');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get token balance
  app.get('/api/balances/:address/:tokenId', async (req, res) => {
    try {
      const balance = await prisma.tokenBalance.findUnique({
        where: {
          address_tokenId: {
            address: req.params.address,
            tokenId: req.params.tokenId,
          },
        },
      });

      if (!balance) {
        return res.json({ balance: '0' });
      }

      res.json(balance);
    } catch (error) {
      logger.error({ error }, 'Error fetching balance');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get all balances for address
  app.get('/api/balances/:address', async (req, res) => {
    try {
      const balances = await prisma.tokenBalance.findMany({
        where: { address: req.params.address },
        include: { token: true },
      });

      res.json({
        balances: balances.map(b => ({
          ...b,
          symbol: b.token.symbol,
        })),
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching balances');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get transfers
  app.get('/api/transfers/:address', async (req, res) => {
    try {
      const { tokenId } = req.query;

      const where: any = {
        OR: [
          { fromAddress: req.params.address },
          { toAddress: req.params.address },
        ],
      };

      if (tokenId) {
        where.tokenId = tokenId;
      }

      const transfers = await prisma.tokenTransfer.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: 100,
      });

      res.json({ transfers });
    } catch (error) {
      logger.error({ error }, 'Error fetching transfers');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get token details by ID
  app.get('/api/tokens/:tokenId', async (req, res) => {
    try {
      const token = await prisma.token.findUnique({
        where: { id: req.params.tokenId },
      });

      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      res.json(token);
    } catch (error) {
      logger.error({ error }, 'Error fetching token details');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get transaction
  app.get('/api/transactions/:txid', async (req, res) => {
    try {
      const transfer = await prisma.tokenTransfer.findFirst({
        where: { txid: req.params.txid },
      });

      if (!transfer) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      res.json(transfer);
    } catch (error) {
      logger.error({ error }, 'Error fetching transaction');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Register new token (called by wallet after creation)
  // Now with Bitcoin L1 proof support
  app.post('/api/tokens',
    tokenCreationLimiter, // Apply stricter rate limit
    [
      body('tokenId').isString().trim().notEmpty().isLength({ max: 100 }),
      body('name').isString().trim().notEmpty().isLength({ max: 100 }),
      body('symbol').isString().trim().notEmpty().isLength({ max: 20 }),
      body('totalSupply').isString().matches(/^\d+$/),
      body('decimals').optional().isInt({ min: 0, max: 18 }),
      body('creator').isString().matches(/^[a-km-zA-HJ-NP-Z1-9]{25,90}$/),
      body('bitcoinAddress').optional().isString(),
    ],
    async (req: express.Request, res: express.Response) => {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      try {
        const { 
          tokenId, 
          name, 
          symbol, 
          totalSupply, 
          decimals, 
          creator, 
          vtxoId,
          status,            // pending | confirmed | failed
          bitcoinProof,      // Bitcoin L1 TXID
          bitcoinAddress,    // Bitcoin L1 address
          opReturnData,      // Hex-encoded OP_RETURN data
          confirmations,     // Number of Bitcoin confirmations
          isPresale,         // Is presale token
          presaleBatchAmount,
          priceInSats,
          maxPurchasesPerWallet
        } = req.body;

      // Validate required fields (vtxoId optional for pending tokens)
      if (!tokenId || !name || !symbol || !totalSupply || !creator) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Bitcoin proof is optional for backward compatibility, but recommended
      logger.info({ 
        tokenId, 
        vtxoId, 
        creator,
        hasBitcoinProof: !!bitcoinProof 
      }, 'Registering token (2-phase creation)');

      // Check if token already exists
      const existing = await prisma.token.findUnique({
        where: { id: tokenId },
      });

      if (existing) {
        return res.status(409).json({ error: 'Token already exists' });
      }

      // Check if VTXO was already used (prevent re-using same VTXO)
      // Only check if vtxoId is provided (not for pending tokens)
      if (vtxoId) {
        const vtxoUsed = await prisma.vtxoUsage.findUnique({
          where: { outpoint: vtxoId },
        });

        if (vtxoUsed) {
          logger.warn({ tokenId, vtxoId }, 'Token creation rejected - VTXO already used');
          return res.status(400).json({ error: 'VTXO already used for another token' });
        }
      }

      // Parse pre-sale data from opReturnData if available
      let presaleData: any = {
        isPresale: false,
      };
      
      if (opReturnData) {
        try {
          const buffer = Buffer.from(opReturnData, 'hex');
          let offset = 3 + 1 + 1; // Skip protocol, version, opType
          
          // Skip name
          const nameLen = buffer[offset];
          offset += 1 + nameLen;
          
          // Skip symbol
          const symbolLen = buffer[offset];
          offset += 1 + symbolLen;
          
          // Skip supply (8 bytes) and decimals (1 byte)
          offset += 8 + 1;
          
          // Check for pre-sale flag
          if (offset < buffer.length) {
            const presaleFlag = buffer[offset];
            offset += 1;
            
            if (presaleFlag === 0x01 && offset + 18 <= buffer.length) {
              presaleData.isPresale = true;
              presaleData.presaleBatchAmount = buffer.readBigUInt64LE(offset).toString();
              offset += 8;
              presaleData.priceInSats = buffer.readBigUInt64LE(offset).toString();
              offset += 8;
              presaleData.maxPurchasesPerWallet = buffer.readUInt16LE(offset);
              
              logger.info({ tokenId, presaleData }, 'Pre-sale token detected');
            }
          }
        } catch (error) {
          logger.warn({ tokenId, error }, 'Failed to parse pre-sale data from OP_RETURN');
        }
      }

      // Determine payment receiver address
      // If pool mode enabled and this is a pre-sale token, use pool wallet
      let paymentAddress = creator;
      
      if (PRESALE_POOL_CONFIG.enabled && presaleData.isPresale) {
        try {
          const poolWallet = await getNextAvailablePoolWallet();
          paymentAddress = poolWallet.address;
          logger.info({ 
            tokenId, 
            poolWallet: paymentAddress.slice(0, 20) + '...', 
            originalCreator: creator,
            realBalance: poolWallet.currentVolume
          }, 'Using pool wallet for pre-sale payments (ASP balance checked)');
        } catch (error: any) {
          logger.error({ error: error.message }, 'Failed to get pool wallet, using creator address');
          // Fallback to creator if pool wallet assignment fails
        }
      }

      // Use provided presale data or parse from OP_RETURN
      if (isPresale !== undefined) {
        presaleData = {
          isPresale,
          presaleBatchAmount,
          priceInSats,
          maxPurchasesPerWallet
        };
      }

      // Create token and record VTXO usage atomically
      const token = await prisma.$transaction(async (tx) => {
        // Create token with L1 proof and pre-sale data
        const newToken = await tx.token.create({
          data: {
            id: tokenId,
            name,
            symbol,
            totalSupply,
            decimals: decimals || 8,
            creator: paymentAddress,  // Use pool wallet or creator
            createdInTx: vtxoId || 'pending',  // Arkade L2 VTXO (pending if not yet created)
            vtxoId: vtxoId || null,            // Optional VTXO ID (null for pending)
            status: status || 'confirmed',     // Default to confirmed for backward compat
            bitcoinProof: bitcoinProof || tokenId,  // Bitcoin L1 TXID
            bitcoinAddress: bitcoinAddress,     // Bitcoin L1 address
            opReturnData: opReturnData,         // OP_RETURN hex
            confirmations: confirmations || 0,   // Bitcoin confirmations
            isPresale: presaleData.isPresale,
            presaleBatchAmount: presaleData.presaleBatchAmount,
            priceInSats: presaleData.priceInSats,
            maxPurchasesPerWallet: presaleData.maxPurchasesPerWallet,
          },
        });

        // Only create initial balance and VTXO usage for confirmed tokens
        if (status !== 'pending') {
          // Create initial balance for creator
          await tx.tokenBalance.create({
            data: {
              address: creator,
              tokenId,
              balance: totalSupply,
            },
          });

          // Record VTXO usage to prevent double-spending (only if vtxoId provided)
          if (vtxoId) {
            await tx.vtxoUsage.create({
              data: {
                outpoint: vtxoId,
                tokenId,
                usedInTx: vtxoId,
              },
            });
          }
        }

        return newToken;
      });

      logger.info({ 
        tokenId, 
        name, 
        symbol, 
        vtxoId, 
        bitcoinProof,
        bitcoinAddress,
        status: token.status
      }, 'Token registered (2-phase: L1 proof + L2 tracking)');
      
      // If token is pending, start monitoring for confirmation
      if (token.status === 'pending') {
        logger.info({ tokenId, symbol }, '🔄 Starting on-demand monitor for pending token');
        // Import and start monitoring this specific token
        import('../services/tokenMonitor').then(({ startMonitoringToken }) => {
          startMonitoringToken(tokenId);
        }).catch((error) => {
          logger.error({ error: error.message }, '❌ Failed to start token monitor');
        });
      }
      
      res.status(201).json(token);
    } catch (error) {
      logger.error({ error }, 'Error registering token');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Register token transfer (called by wallet after transfer)
  app.post('/api/transfers',
    [
      body('tokenId').isString().trim().notEmpty(),
      body('fromAddress').isString().matches(/^[a-km-zA-HJ-NP-Z1-9]{25,90}$/),
      body('toAddress').isString().matches(/^[a-km-zA-HJ-NP-Z1-9]{25,90}$/),
      body('amount').isString().matches(/^\d+$/),
      body('vtxoId').isString().trim().notEmpty(),
    ],
    async (req: express.Request, res: express.Response) => {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      try {
        const { tokenId, fromAddress, toAddress, amount, vtxoId } = req.body;

      // VERIFY VTXO with Arkade ASP before accepting transfer
      // Note: VTXO verification with ASP is optional
      logger.info({ tokenId, vtxoId, fromAddress, toAddress }, 'Recording transfer with vtxoId');

      // Check if VTXO was already used (prevent double-spending)
      const vtxoUsed = await prisma.vtxoUsage.findUnique({
        where: { outpoint: vtxoId },
      });

      if (vtxoUsed) {
        logger.warn({ tokenId, vtxoId }, 'Transfer rejected - VTXO already used');
        return res.status(400).json({ error: 'VTXO already used for another transfer' });
      }

      // Check if token exists
      const token = await prisma.token.findUnique({
        where: { id: tokenId },
      });

      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      // Check sender balance
      const senderBalance = await prisma.tokenBalance.findUnique({
        where: {
          address_tokenId: {
            address: fromAddress,
            tokenId,
          },
        },
      });

      const currentBalance = BigInt(senderBalance?.balance || '0');
      const transferAmount = BigInt(amount);

      if (currentBalance < transferAmount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Update balances
      await prisma.$transaction(async (tx) => {
        // Deduct from sender
        await tx.tokenBalance.upsert({
          where: {
            address_tokenId: {
              address: fromAddress,
              tokenId,
            },
          },
          update: {
            balance: (currentBalance - transferAmount).toString(),
          },
          create: {
            address: fromAddress,
            tokenId,
            balance: (currentBalance - transferAmount).toString(),
          },
        });

        // Add to recipient
        const recipientBalance = await tx.tokenBalance.findUnique({
          where: {
            address_tokenId: {
              address: toAddress,
              tokenId,
            },
          },
        });

        const recipientCurrent = BigInt(recipientBalance?.balance || '0');

        await tx.tokenBalance.upsert({
          where: {
            address_tokenId: {
              address: toAddress,
              tokenId,
            },
          },
          update: {
            balance: (recipientCurrent + transferAmount).toString(),
          },
          create: {
            address: toAddress,
            tokenId,
            balance: (recipientCurrent + transferAmount).toString(),
          },
        });

        // Record transfer
        await tx.tokenTransfer.create({
          data: {
            txid: vtxoId,
            tokenId,
            fromAddress,
            toAddress,
            amount,
          },
        });

        // Record VTXO usage to prevent double-spending
        await tx.vtxoUsage.create({
          data: {
            outpoint: vtxoId,
            tokenId,
            usedInTx: vtxoId,
          },
        });
      });

      logger.info({ tokenId, fromAddress, toAddress, amount, vtxoId }, 'Transfer recorded with VTXO verification');
      res.status(201).json({ success: true });
    } catch (error) {
      logger.error({ error }, 'Error recording transfer');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============================================
  // ASP VTXO INDEXER ENDPOINTS
  // ============================================

  // Get transaction history for an address from ASP Indexer
  app.get('/api/asp/history/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const axios = require('axios');
      
      const ASP_URL = process.env.ARKADE_ASP_URL || 'https://arkade.computer';
      const url = `${ASP_URL}/v1/history/${address}`;
      
      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: (status: number) => status < 500
      });
      
      if (response.status === 404 || !response.data) {
        return res.status(404).json({
          success: false,
          error: 'No transaction history found for this address',
          address
        });
      }
      
      res.json({
        success: true,
        address,
        history: response.data.history || [],
        pagination: response.data.page || null
      });
    } catch (error: any) {
      logger.error({ error }, 'ASP history query error');
      res.status(500).json({ 
        success: false,
        error: error.message,
        address: req.params.address
      });
    }
  });

  // Get VTXOs for an address from ASP Indexer
  app.get('/api/asp/vtxos/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const { spendableOnly, spentOnly } = req.query;
      const axios = require('axios');
      
      const ASP_URL = process.env.ARKADE_ASP_URL || 'https://arkade.computer';
      let url = `${ASP_URL}/v1/getVtxos/${address}`;
      
      const params = [];
      if (spendableOnly === 'true') params.push('spendableOnly=true');
      if (spentOnly === 'true') params.push('spentOnly=true');
      if (params.length > 0) url += '?' + params.join('&');
      
      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: (status: number) => status < 500
      });
      
      if (response.status === 404 || !response.data) {
        return res.status(404).json({
          success: false,
          error: 'No VTXOs found for this address',
          address
        });
      }
      
      res.json({
        success: true,
        address,
        vtxos: response.data.vtxos || [],
        pagination: response.data.page || null
      });
    } catch (error: any) {
      logger.error({ error }, 'ASP VTXOs query error');
      res.status(500).json({ 
        success: false,
        error: error.message,
        address: req.params.address
      });
    }
  });

  // Get VTXO chain information
  app.get('/api/asp/vtxo-chain/:txid/:vout', async (req, res) => {
    try {
      const { txid, vout } = req.params;
      const axios = require('axios');
      
      const ASP_URL = process.env.ARKADE_ASP_URL || 'https://arkade.computer';
      const url = `${ASP_URL}/v1/vtxo/${txid}/${vout}/chain`;
      
      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: (status: number) => status < 500
      });
      
      if (response.status === 404 || !response.data) {
        return res.status(404).json({
          success: false,
          error: 'VTXO chain not found',
          txid,
          vout: parseInt(vout)
        });
      }
      
      res.json({
        success: true,
        txid,
        vout: parseInt(vout),
        chain: response.data.chain || [],
        depth: response.data.depth || 0,
        rootCommitmentTxid: response.data.rootCommitmentTxid || null,
        pagination: response.data.page || null
      });
    } catch (error: any) {
      logger.error({ error }, 'ASP VTXO chain query error');
      res.status(500).json({ 
        success: false,
        error: error.message,
        txid: req.params.txid,
        vout: parseInt(req.params.vout)
      });
    }
  });

  // SDK-based endpoints - Query wallet data using Ark SDK
  
  // Get all VTXOs for a wallet
  app.post('/api/asp/sdk/vtxos', async (req, res) => {
    try {
      const { privateKey } = req.body;
      
      if (!privateKey) {
        return res.status(400).json({ 
          success: false,
          error: 'privateKey required in request body' 
        });
      }
      
      const result = await queryVtxosViaSdk(privateKey);
      res.json(result);
    } catch (error: any) {
      logger.error({ error }, 'SDK VTXOs error');
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // Get balance for a wallet
  app.post('/api/asp/sdk/balance', async (req, res) => {
    try {
      const { privateKey } = req.body;
      
      if (!privateKey) {
        return res.status(400).json({ 
          success: false,
          error: 'privateKey required in request body' 
        });
      }
      
      const result = await queryBalanceViaSdk(privateKey);
      res.json(result);
    } catch (error: any) {
      logger.error({ error }, 'SDK balance error');
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // Get transaction history for a wallet
  app.post('/api/asp/sdk/history', async (req, res) => {
    try {
      const { privateKey } = req.body;
      
      if (!privateKey) {
        return res.status(400).json({ 
          success: false,
          error: 'privateKey required in request body' 
        });
      }
      
      const result = await queryHistoryViaSdk(privateKey);
      res.json(result);
    } catch (error: any) {
      logger.error({ error }, 'SDK history error');
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // Get Arkade address from private key
  app.post('/api/asp/sdk/address', async (req, res) => {
    try {
      const { privateKey } = req.body;
      
      if (!privateKey) {
        return res.status(400).json({ 
          success: false,
          error: 'privateKey required in request body' 
        });
      }
      
      const result = await getAddressViaSdk(privateKey);
      res.json(result);
    } catch (error: any) {
      logger.error({ error }, 'SDK address error');
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // Verify if specific VTXO exists in a wallet
  app.post('/api/asp/sdk/verify-vtxo', async (req, res) => {
    try {
      const { privateKey, vtxoId } = req.body;
      
      if (!privateKey || !vtxoId) {
        return res.status(400).json({ 
          success: false,
          error: 'privateKey and vtxoId required in request body' 
        });
      }
      
      const result = await verifyVtxoViaSdk(privateKey, vtxoId);
      res.json(result);
    } catch (error: any) {
      logger.error({ error }, 'SDK verify VTXO error');
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // Get active pre-sale tokens
  app.get('/api/presale/tokens', async (req, res) => {
    try {
      const presaleTokens = await prisma.token.findMany({
        where: { isPresale: true },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ tokens: presaleTokens });
    } catch (error) {
      logger.error({ error }, 'Error fetching pre-sale tokens');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get pre-sale progress for a token
  app.get('/api/presale/:tokenId/progress', async (req, res) => {
    try {
      const { tokenId } = req.params;

      const token = await prisma.token.findUnique({
        where: { id: tokenId },
      });

      if (!token || !token.isPresale) {
        return res.status(404).json({ error: 'Pre-sale token not found' });
      }

      // Get total purchases
      const purchases = await prisma.presalePurchase.findMany({
        where: { tokenId },
      });

      const totalBatchesSold = purchases.reduce((sum, p) => sum + p.batchesPurchased, 0);
      const batchAmount = BigInt(token.presaleBatchAmount || '0');
      const totalTokensSold = BigInt(totalBatchesSold) * batchAmount;
      const totalSupply = BigInt(token.totalSupply);
      // Calculate percentage using floating point to avoid truncation
      const progressPercent = totalSupply > BigInt(0)
        ? (Number(totalTokensSold) / Number(totalSupply)) * 100
        : 0;

      res.json({
        tokenId,
        name: token.name,
        symbol: token.symbol,
        totalSupply: token.totalSupply,
        decimals: token.decimals,
        batchAmount: token.presaleBatchAmount,
        priceInSats: token.priceInSats,
        maxPurchasesPerWallet: token.maxPurchasesPerWallet,
        totalBatchesSold,
        totalTokensSold: totalTokensSold.toString(),
        progressPercent,
        totalPurchases: purchases.length,
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching pre-sale progress');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get user's purchases for a token
  app.get('/api/presale/:tokenId/purchases/:address', async (req, res) => {
    try {
      const { tokenId, address } = req.params;

      const purchases = await prisma.presalePurchase.findMany({
        where: {
          tokenId,
          walletAddress: address,
        },
        orderBy: { purchasedAt: 'desc' },
      });

      const totalBatches = purchases.reduce((sum, p) => sum + p.batchesPurchased, 0);
      const totalPaid = purchases.reduce((sum, p) => sum + BigInt(p.totalPaid), 0n);

      res.json({
        purchases,
        totalBatches,
        totalPaid: totalPaid.toString(),
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching user purchases');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get all purchases for a presale token
  app.get('/api/presale/:tokenId/all-purchases', async (req, res) => {
    try {
      const { tokenId } = req.params;

      const purchases = await prisma.presalePurchase.findMany({
        where: { tokenId },
        orderBy: { purchasedAt: 'desc' },
      });

      res.json({ purchases });
    } catch (error) {
      logger.error({ error }, 'Error fetching all purchases');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Record a pre-sale purchase
  // Get pool wallet statistics (for monitoring)
  app.get('/api/presale/pool-stats', async (req, res) => {
    try {
      const stats = await getPoolWalletStats();
      res.json(stats);
    } catch (error) {
      logger.error({ error }, 'Error getting pool stats');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/presale/purchase',
    [
      body('tokenId').isString().trim().notEmpty(),
      body('walletAddress').isString().matches(/^[a-km-zA-HJ-NP-Z1-9]{25,90}$/),
      body('batchesPurchased').isInt({ min: 1, max: 1000 }),
      body('totalPaid').isString().matches(/^\d+$/),
      body('txid').isString().trim().notEmpty(),
    ],
    async (req: express.Request, res: express.Response) => {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      try {
        const { tokenId, walletAddress, batchesPurchased, totalPaid, txid } = req.body;

      const token = await prisma.token.findUnique({
        where: { id: tokenId },
      });

      if (!token || !token.isPresale) {
        return res.status(404).json({ error: 'Pre-sale token not found' });
      }

      // ============================================================================
      // PRE-FLIGHT CHECK: Verify supply available BEFORE accepting payment
      // ============================================================================
      
      logger.info({ tokenId, batchesPurchased }, '🔍 Pre-flight: Checking supply availability...');
      
      const allPurchases = await prisma.presalePurchase.aggregate({
        where: { tokenId },
        _sum: { batchesPurchased: true }
      });
      
      const totalBatchesSold = allPurchases._sum.batchesPurchased || 0;
      const batchAmount = BigInt(token.presaleBatchAmount || '0');
      const tokenSupply = BigInt(token.totalSupply);
      const maxBatches = Number(tokenSupply / batchAmount);
      
      if (totalBatchesSold + batchesPurchased > maxBatches) {
        const remainingBatches = maxBatches - totalBatchesSold;
        logger.warn({
          tokenId,
          requestedBatches: batchesPurchased,
          remainingBatches,
          totalSold: totalBatchesSold,
          maxBatches
        }, '❌ Pre-flight failed: Insufficient supply');
        
        return res.status(400).json({ 
          error: `Insufficient supply. Only ${remainingBatches} batches remaining (you tried to purchase ${batchesPurchased} batches).`,
          remainingBatches,
          requestedBatches: batchesPurchased
        });
      }
      
      logger.info({
        tokenId,
        totalBatchesSold,
        requestedBatches: batchesPurchased,
        maxBatches,
        percentSold: ((totalBatchesSold / maxBatches) * 100).toFixed(2) + '%'
      }, '✅ Pre-flight passed: Supply available');

      // ============================================================================
      // PAYMENT VERIFICATION: Verify VTXO payment actually arrived at pool wallet
      // ============================================================================
      
      logger.info({ tokenId, txid, receiverAddress: token.creator }, '🔍 Verifying VTXO payment...');
      
      try {
        // Find the pool wallet to get its private key for verification
        const poolWallet = PRESALE_POOL_WALLETS.find(w => w.address === token.creator);
        
        if (!poolWallet) {
          logger.error({ tokenAddress: token.creator }, 'Token creator is not a pool wallet - cannot verify VTXO');
          return res.status(500).json({ 
            error: 'Internal error: Token creator address not in pool wallet list.' 
          });
        }
        
        // Verify VTXO exists in the pool wallet using SDK
        const verificationResult = await verifyVtxoViaSdk(poolWallet.privateKey, txid);
        
        if (!verificationResult.success || !verificationResult.exists) {
          logger.warn({ txid, verificationResult }, 'VTXO not found in pool wallet - payment not confirmed');
          return res.status(400).json({ 
            error: 'Payment not confirmed. VTXO not found in destination wallet.' 
          });
        }
        
        logger.info({ txid, verificationResult }, '📦 VTXO found in pool wallet');
        
        // Extract VTXO value
        const vtxoValue = verificationResult.vtxo?.value;
        
        if (!vtxoValue) {
          logger.warn({ txid, verificationResult }, 'VTXO found but has no value');
          return res.status(400).json({ 
            error: 'Payment verification failed. VTXO has no value.' 
          });
        }
        
        // Verify payment amount matches expected amount
        const expectedAmount = parseInt(totalPaid.toString());
        const actualAmount = parseInt(vtxoValue.toString());
        
        if (actualAmount !== expectedAmount) {
          logger.warn({ 
            txid, 
            expectedAmount,
            actualAmount
          }, 'VTXO amount mismatch');
          return res.status(400).json({ 
            error: `Payment amount mismatch. Expected ${expectedAmount} sats, received ${actualAmount} sats.` 
          });
        }
        
        logger.info({ 
          txid, 
          receiver: token.creator,
          amount: actualAmount,
          vtxoStatus: verificationResult.vtxo?.status
        }, '✅ VTXO payment verified in pool wallet');
        
      } catch (error: any) {
        logger.error({ txid, error: error.message }, 'Failed to verify VTXO payment');
        return res.status(500).json({ 
          error: 'Payment verification failed. Please try again.' 
        });
      }

      // ============================================================================
      // ATOMIC PURCHASE WITH POSTGRESQL ADVISORY LOCK
      // ============================================================================
      
      // PRE-TRANSACTION: Check if rotation needed and get next wallet BEFORE transaction
      let nextWalletForRotation: string | null = null;
      
      if (PRESALE_POOL_CONFIG.enabled && token.creator) {
        const amountInSats = parseInt(totalPaid.toString());
        const currentWallet = PRESALE_POOL_WALLETS.find(w => w.address === token.creator);
        
        if (currentWallet) {
          const wouldExceedThreshold = (currentWallet.currentVolume + amountInSats) > PRESALE_POOL_CONFIG.WALLET_THRESHOLD_SATS;
          
          if (wouldExceedThreshold) {
            logger.info({ 
              tokenId, 
              currentWallet: currentWallet.address.slice(0, 20) + '...', 
              currentVolume: currentWallet.currentVolume,
              newAmount: amountInSats,
              threshold: PRESALE_POOL_CONFIG.WALLET_THRESHOLD_SATS
            }, '🔄 Pre-checking: Rotation will be needed');
            
            // Get next available wallet BEFORE starting transaction (this is slow - queries ASP)
            const nextWallet = await getNextAvailablePoolWallet();
            nextWalletForRotation = nextWallet.address;
            
            logger.info({ 
              tokenId, 
              nextWallet: nextWalletForRotation.slice(0, 20) + '...' 
            }, '✅ Next wallet prepared for rotation');
          }
        }
      }
      
      try {
        // Start fast atomic transaction (all ASP queries done above)
        const purchase = await prisma.$transaction(async (tx) => {
          // Create numeric lock ID from tokenId (use first 16 hex chars)
          // Convert to number (safe for 16 hex chars = 64 bits but we'll use smaller hash)
          const lockId = parseInt(tokenId.slice(0, 15), 16); // Use 15 chars to stay in safe integer range
          
          // Acquire PostgreSQL advisory lock for this token
          // This lock is released automatically when transaction commits
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId}::bigint)`;
          
          logger.info({ tokenId, lockId }, '🔒 Acquired database lock for purchase');
          
          // Lock the token row to prevent concurrent modifications
          const [lockedToken] = await tx.$queryRaw<any[]>`
            SELECT * FROM "tokens" WHERE id = ${tokenId} FOR UPDATE
          `;
          
          if (!lockedToken || !lockedToken.isPresale) {
            throw new Error('Pre-sale token not found');
          }
          
          // WALLET ROTATION (if needed - wallet already prepared outside transaction)
          let currentCreatorAddress = lockedToken.creator;
          
          if (nextWalletForRotation) {
            // Update token's creator address to new wallet (fast - no ASP queries)
            await tx.token.update({
              where: { id: tokenId },
              data: { creator: nextWalletForRotation }
            });
            
            currentCreatorAddress = nextWalletForRotation;
            
            logger.info({ 
              tokenId, 
              newWallet: nextWalletForRotation.slice(0, 20) + '...' 
            }, '✅ Rotated to new pool wallet (atomic)');
          }
          
          // Check per-wallet purchase limit (within transaction - sees all committed purchases)
          const purchaseCount = await tx.presalePurchase.count({
            where: { tokenId, walletAddress }
          });
          
          const walletTotalBatches = await tx.presalePurchase.aggregate({
            where: { tokenId, walletAddress },
            _sum: { batchesPurchased: true }
          });
          
          const currentWalletBatches = walletTotalBatches._sum.batchesPurchased || 0;
          
          if (lockedToken.maxPurchasesPerWallet && currentWalletBatches + batchesPurchased > lockedToken.maxPurchasesPerWallet) {
            throw new Error(`Purchase limit exceeded. Maximum ${lockedToken.maxPurchasesPerWallet} batches per wallet.`);
          }
          
          // Check TOTAL supply limit (within transaction - prevents overselling)
          const allPurchases = await tx.presalePurchase.aggregate({
            where: { tokenId },
            _sum: { batchesPurchased: true }
          });
          
          const totalBatchesSoldSoFar = allPurchases._sum.batchesPurchased || 0;
          const batchAmount = BigInt(lockedToken.presaleBatchAmount || '0');
          const tokenSupply = BigInt(lockedToken.totalSupply);
          const maxBatches = Number(tokenSupply / batchAmount);
          
          if (totalBatchesSoldSoFar + batchesPurchased > maxBatches) {
            const remainingBatches = maxBatches - totalBatchesSoldSoFar;
            
            // TODO: CRITICAL - User already paid! Need refund mechanism
            // Their VTXO payment was verified but supply ran out due to race condition
            // Options: 1) Automatic refund via SDK, 2) Manual refund process, 3) Failed purchase table
            logger.error({
              tokenId,
              walletAddress,
              txid,
              amountPaid: totalPaid.toString(),
              batchesRequested: batchesPurchased,
              remainingBatches
            }, '🚨 PAYMENT RECEIVED BUT SUPPLY INSUFFICIENT - REFUND NEEDED');
            
            throw new Error(`Insufficient supply. Only ${remainingBatches} batches remaining (you tried to purchase ${batchesPurchased} batches).`);
          }
          
          logger.info({
            tokenId,
            totalBatchesSold: totalBatchesSoldSoFar,
            newBatches: batchesPurchased,
            maxBatches,
            percentSold: ((totalBatchesSoldSoFar / maxBatches) * 100).toFixed(2) + '%'
          }, '📊 Supply check passed');
          
          // Create purchase record (within transaction)
          const newPurchase = await tx.presalePurchase.create({
            data: {
              tokenId,
              walletAddress,
              batchesPurchased,
              totalPaid: totalPaid.toString(),
              txid,
            },
          });
          
          logger.info({ 
            tokenId, 
            walletAddress, 
            batchesPurchased, 
            txid,
            finalCreator: currentCreatorAddress 
          }, '✅ Pre-sale purchase recorded (atomic)');
          
          // Update pool wallet volume tracking (deprecated but kept for compatibility)
          if (PRESALE_POOL_CONFIG.enabled && currentCreatorAddress) {
            const amountInSats = parseInt(totalPaid.toString());
            updatePoolWalletVolume(currentCreatorAddress, amountInSats);
          }
          
          return newPurchase;
        }, {
          timeout: 15000, // 15 seconds timeout (increased from default 5s)
        });
        
        // Transaction committed successfully - lock released
        logger.info({ tokenId }, '🔓 Database lock released');
        
        res.json({ success: true, purchase });
        
      } catch (error: any) {
        logger.error({ tokenId, error: error.message }, 'Transaction failed');
        
        if (error.message.includes('Purchase limit exceeded')) {
          return res.status(400).json({ error: error.message });
        }
        
        return res.status(500).json({ error: 'Purchase transaction failed. Please try again.' });
      }
      
    } catch (error) {
      logger.error({ error }, 'Error in purchase endpoint');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============================================================================
  // BACKGROUND MONITOR: Proactive Pool Wallet Rotation
  // ============================================================================
  
  /**
   * Start token creation monitor
   * Monitors pending OP_RETURN transactions and completes Arkade settlement
   */
  logger.info('🔧 Initializing token creation monitor...');
  import('../services/tokenMonitor').then(({ startTokenMonitor }) => {
    logger.info('✅ Token monitor module loaded, starting...');
    startTokenMonitor();
  }).catch((error) => {
    logger.error({ error: error.message, stack: error.stack }, '❌ Failed to load token monitor');
  });
  
  /**
   * Background monitor that checks all presale tokens periodically
   * and rotates wallets when they reach threshold - independent of purchases
   */
  if (PRESALE_POOL_CONFIG.enabled) {
    logger.info({ 
      intervalMs: PRESALE_POOL_CONFIG.MONITOR_INTERVAL_MS,
      intervalSeconds: PRESALE_POOL_CONFIG.MONITOR_INTERVAL_MS / 1000 
    }, '🔄 Starting pool wallet background monitor');
    
    setInterval(async () => {
      try {
        logger.info('🔍 [Monitor] Checking all presale tokens for wallet rotation...');
        
        // Find all presale tokens using pool wallets
        const presaleTokens = await prisma.token.findMany({
          where: {
            isPresale: true,
            creator: {
              in: PRESALE_POOL_WALLETS.map(w => w.address)
            }
          },
          select: {
            id: true,
            name: true,
            creator: true
          }
        });
        
        if (presaleTokens.length === 0) {
          logger.info('[Monitor] No active presale tokens found');
          return;
        }
        
        logger.info({ count: presaleTokens.length }, '[Monitor] Found presale tokens to check');
        
        // Check each token and rotate if needed (with database locks)
        for (const token of presaleTokens) {
          try {
            // Check if rotation is needed BEFORE transaction (query ASP first)
            const newWalletAddress = await checkAndRotateIfNeeded(token.id, token.creator);
            
            if (newWalletAddress) {
              // Use PostgreSQL advisory lock to prevent race conditions during update
              await prisma.$transaction(async (tx) => {
                // Create numeric lock ID from tokenId (use 15 chars to stay in safe integer range)
                const lockId = parseInt(token.id.slice(0, 15), 16);
                
                // Try to acquire lock (skip if already locked by purchase)
                const [lockResult] = await tx.$queryRaw<Array<{ pg_try_advisory_xact_lock: boolean }>>`
                  SELECT pg_try_advisory_xact_lock(${lockId}::bigint)
                `;
                
                if (!lockResult.pg_try_advisory_xact_lock) {
                  logger.info({ tokenId: token.id }, '[Monitor] Token locked by another operation, skipping rotation');
                  return;
                }
                
                logger.info({ tokenId: token.id, lockId }, '🔒 [Monitor] Acquired database lock for rotation');
                
                // Update token's creator to new wallet (within transaction)
                await tx.token.update({
                  where: { id: token.id },
                  data: { creator: newWalletAddress }
                });
                
                logger.info({ 
                  tokenId: token.id,
                  tokenName: token.name,
                  oldWallet: token.creator.slice(0, 20) + '...',
                  newWallet: newWalletAddress.slice(0, 20) + '...'
                }, '✅ [Monitor] Token wallet rotated (atomic)');
                
                logger.info({ tokenId: token.id }, '🔓 [Monitor] Database lock released');
              });
            }
          } catch (error: any) {
            logger.error({ 
              tokenId: token.id, 
              errorName: error.name,
              errorMessage: error.message,
              errorStack: error.stack
            }, '[Monitor] Failed to rotate token wallet');
          }
        }
        
        logger.info('[Monitor] Check completed');
      } catch (error) {
        logger.error({ error }, '[Monitor] Error in background wallet check');
      }
    }, PRESALE_POOL_CONFIG.MONITOR_INTERVAL_MS);
  }

  // ============================================================================
  // ROUND-BASED PURCHASE ENDPOINTS
  // ============================================================================

  /**
   * GET /api/presale/check-supply/:tokenId/:batchCount
   * Pre-flight check: Verify if supply is available BEFORE user pays
   * 
   * Response:
   * - available: boolean
   * - batchesRemaining: number
   * - message: string
   */
  app.get('/api/presale/check-supply/:tokenId/:batchCount', async (req, res) => {
    try {
      const { tokenId, batchCount } = req.params;
      const requestedBatches = parseInt(batchCount);

      if (isNaN(requestedBatches) || requestedBatches < 1) {
        return res.status(400).json({ error: 'Invalid batch count' });
      }

      const token = await prisma.token.findUnique({
        where: { id: tokenId },
      });

      if (!token || !token.isPresale) {
        return res.status(404).json({ error: 'Pre-sale token not found' });
      }

      // Calculate available supply
      const totalSupply = BigInt(token.totalSupply);
      const batchAmount = BigInt(token.presaleBatchAmount || '0');
      const maxBatches = Number(totalSupply / batchAmount);

      // Get total batches already sold (confirmed purchases)
      const soldAgg = await prisma.presalePurchase.aggregate({
        where: { tokenId },
        _sum: { batchesPurchased: true }
      });
      const batchesSold = soldAgg._sum.batchesPurchased || 0;

      // CRITICAL: Also count pending queue requests that are being processed
      const pendingAgg = await prisma.purchaseRequest.aggregate({
        where: { 
          tokenId,
          status: { in: ['pending', 'processing'] }
        },
        _sum: { batchesPurchased: true }
      });
      const batchesPending = pendingAgg._sum.batchesPurchased || 0;

      // Total reserved = confirmed + pending
      const batchesReserved = batchesSold + batchesPending;
      const batchesRemaining = maxBatches - batchesReserved;

      const available = requestedBatches <= batchesRemaining;

      logger.info({
        tokenId,
        requestedBatches,
        batchesSold,
        batchesPending,
        batchesReserved,
        batchesRemaining,
        available
      }, '🔍 Pre-flight supply check (includes pending queue)');

      res.json({
        available,
        batchesRemaining,
        maxBatches,
        batchesSold,
        batchesPending,
        batchesReserved,
        message: available
          ? `Supply available. ${batchesRemaining} batch(es) remaining (${batchesSold} sold, ${batchesPending} pending).`
          : `Insufficient supply. Only ${batchesRemaining} batch(es) remaining (you requested ${requestedBatches}). ${batchesSold} sold, ${batchesPending} pending in queue.`
      });

    } catch (error: any) {
      logger.error({ error: error.message }, 'Error checking supply');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/presale/round-purchase
   * Submit a purchase request to the queue (payment already sent via Arkade SDK)
   * 
   * Request body:
   * - tokenId: Token ID
   * - walletAddress: User's wallet address
   * - batchesPurchased: Number of batches to purchase
   * - totalPaid: Total amount paid in sats (string)
   * - txid: VTXO transaction ID (payment already sent)
   * 
   * Response:
   * - requestId: Unique request ID for tracking
   * - queuePosition: Current position in queue (1-indexed)
   * - estimatedWaitSeconds: Estimated wait time
   */
  app.post('/api/presale/round-purchase', async (req, res) => {
    try {
      const { tokenId, walletAddress, batchesPurchased, totalPaid } = req.body;

      // Validate required fields (NO TXID REQUIRED - payment happens later!)
      if (!tokenId || !walletAddress || !batchesPurchased || !totalPaid) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Validate token exists and is presale
      const token = await prisma.token.findUnique({
        where: { id: tokenId },
      });

      if (!token || !token.isPresale) {
        return res.status(404).json({ error: 'Pre-sale token not found' });
      }

      logger.info({ 
        tokenId, 
        walletAddress: walletAddress.slice(0, 20) + '...',
        batchesPurchased,
        totalPaid
      }, '📥 New round-based purchase request (NO PAYMENT YET)');

      // Import queue manager dynamically to avoid circular deps
      const { queueManager } = await import('../queue/queueManager');

      // Create purchase request WITHOUT TXID - payment comes later
      const request = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tokenId,
        walletAddress,
        batchesPurchased,
        totalPaid,
        txid: null, // No payment yet!
        timestamp: Date.now(),
        status: 'pending' as const,
        paymentStatus: 'pending' as const
      };

      // Add to queue
      const queuePosition = await queueManager.addRequest(request);

      // Calculate estimated wait time (15 seconds per round, max 10 requests per round)
      const estimatedRounds = Math.ceil(queuePosition / 10);
      const estimatedWaitSeconds = estimatedRounds * 15;

      logger.info({
        requestId: request.id,
        walletAddress: walletAddress.slice(0, 20) + '...',
        queuePosition,
        estimatedWaitSeconds
      }, '✅ Request added to queue');

      res.json({
        requestId: request.id,
        queuePosition,
        estimatedWaitSeconds,
        message: `Request queued. Position: ${queuePosition}. Estimated wait: ${estimatedWaitSeconds}s.`
      });

    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Error submitting round purchase');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/presale/submit-payment
   * Submit payment txid after receiving payment-requested event
   * 
   * Body:
   * - requestId: Queue request ID
   * - txid: Payment transaction ID
   * 
   * Response:
   * - success: Boolean
   * - message: Status message
   */
  app.post('/api/presale/submit-payment', async (req, res) => {
    try {
      const { requestId, txid } = req.body;

      // Validate required fields
      if (!requestId || !txid) {
        return res.status(400).json({ 
          error: 'Missing required fields: requestId and txid' 
        });
      }

      logger.info({
        requestId,
        txid: txid.slice(0, 20) + '...'
      }, '💳 Payment submission received');

      // Import queue manager dynamically
      const { queueManager } = await import('../queue/queueManager');

      // Submit payment to queue manager
      const updated = await queueManager.submitPayment(requestId, txid);

      if (!updated) {
        logger.warn({ requestId }, '⚠️ Request not found or expired');
        return res.status(404).json({ 
          error: 'Request not found or payment window expired' 
        });
      }

      logger.info({ requestId }, '✅ Payment submitted for verification');

      res.json({ 
        success: true, 
        message: 'Payment submitted and will be verified in the next round' 
      });

    } catch (error: any) {
      logger.error({ 
        error: error.message,
        stack: error.stack 
      }, 'Error submitting payment');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/presale/cancel-payment
   * Cancel a payment request (user unable/unwilling to pay)
   * Frees up locked supply for other users
   * 
   * Body:
   * - requestId: Queue request ID to cancel
   * 
   * Response:
   * - success: Boolean
   * - message: Status message
   */
  app.post('/api/presale/cancel-payment', async (req, res) => {
    try {
      const { requestId } = req.body;

      // Validate required fields
      if (!requestId) {
        return res.status(400).json({ 
          error: 'Missing required field: requestId' 
        });
      }

      logger.info({
        requestId
      }, '🚫 Payment cancellation requested');

      // Import queue manager dynamically
      const { queueManager } = await import('../queue/queueManager');

      // Check if request exists and is in payment-requested state
      const request = await prisma.purchaseRequest.findUnique({
        where: { id: requestId }
      });

      if (!request) {
        logger.warn({ requestId }, '⚠️ Request not found');
        return res.status(404).json({ 
          error: 'Request not found' 
        });
      }

      if (request.paymentStatus !== 'payment-requested') {
        logger.warn({ 
          requestId, 
          currentStatus: request.paymentStatus 
        }, '⚠️ Request not in payment-requested state');
        return res.status(400).json({ 
          error: `Cannot cancel request in ${request.paymentStatus} state` 
        });
      }

      // Mark as rejected
      await queueManager.updateRequestStatus(
        requestId,
        'rejected',
        undefined,
        'User canceled payment'
      );

      // Remove from queue (frees up supply)
      queueManager.removeRequest(request.tokenId, requestId);

      logger.info({ requestId }, '✅ Payment request canceled and supply freed');

      res.json({ 
        success: true, 
        message: 'Payment request canceled successfully. Supply has been freed.' 
      });

    } catch (error: any) {
      logger.error({ 
        error: error.message,
        stack: error.stack 
      }, 'Error canceling payment');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/presale/queue-status/:tokenId/:walletAddress
   * Get queue status for a specific wallet
   * 
   * Response:
   * - requests: Array of pending requests for this wallet
   * - totalPending: Total pending requests in queue
   * - positions: Queue positions for each request
   */
  app.get('/api/presale/queue-status/:tokenId/:walletAddress', async (req, res) => {
    try {
      const { tokenId, walletAddress } = req.params;

      // Import queue manager dynamically
      const { queueManager } = await import('../queue/queueManager');

      // Get wallet's requests
      const walletRequests = queueManager.getWalletRequests(tokenId, walletAddress);

      // Get queue positions for each request
      const requestsWithPositions = walletRequests.map(request => ({
        ...request,
        queuePosition: queueManager.getQueuePosition(tokenId, request.id)
      }));

      // Get total pending count
      const totalPending = queueManager.getTotalPendingCount();

      logger.info({
        tokenId,
        walletAddress: walletAddress.slice(0, 20) + '...',
        requestCount: walletRequests.length,
        totalPending
      }, '📊 Queue status requested');

      res.json({
        requests: requestsWithPositions,
        totalPending,
        message: walletRequests.length === 0 
          ? 'No pending requests' 
          : `You have ${walletRequests.length} pending request(s)`
      });

    } catch (error: any) {
      logger.error({ error: error.message }, 'Error fetching queue status');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/presale/queue-stats/:tokenId
   * Get queue statistics for a token
   * 
   * Response:
   * - totalPending: Total pending requests
   * - totalProcessing: Total processing requests
   * - oldestRequestTimestamp: Timestamp of oldest request
   * - newestRequestTimestamp: Timestamp of newest request
   */
  app.get('/api/presale/queue-stats/:tokenId', async (req, res) => {
    try {
      const { tokenId } = req.params;

      // Import queue manager dynamically
      const { queueManager } = await import('../queue/queueManager');

      const stats = queueManager.getQueueStats(tokenId);

      res.json(stats);

    } catch (error: any) {
      logger.error({ error: error.message }, 'Error fetching queue stats');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/presale/round-info/:tokenId
   * Get current round information for a token
   * 
   * Response:
   * - active: Whether a round is currently active
   * - secondsRemaining: Seconds remaining in current round
   * - currentRound: Current round number
   */
  app.get('/api/presale/round-info/:tokenId', async (req, res) => {
    try {
      const { tokenId } = req.params;

      // Import round timer and processor dynamically
      const { roundTimer } = await import('../queue/roundTimer');
      const { roundProcessor } = await import('../queue/roundProcessor');

      const roundInfo = roundTimer.getRoundInfo(tokenId);
      const currentRound = roundProcessor.getCurrentRound();

      res.json({
        ...roundInfo,
        currentRound
      });

    } catch (error: any) {
      logger.error({ error: error.message }, 'Error fetching round info');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return httpServer;
}

