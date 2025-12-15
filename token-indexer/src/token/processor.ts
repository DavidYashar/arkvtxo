/**
 * Token processor - processes validated token operations
 */

import { PrismaClient } from '@prisma/client';
import { TokenOperation, parseCreateTokenData } from './parser';

export async function processTokenCreate(
  tokenOp: TokenOperation,
  tx: any,
  prisma: PrismaClient
) {
  const parsed = parseCreateTokenData(tokenOp.data);
  if (!parsed) {
    throw new Error('Failed to parse CREATE token data');
  }

  const creator = extractFromAddress(tx);

  // Create token
  await prisma.token.create({
    data: {
      id: tokenOp.tokenId,
      name: parsed.name,
      symbol: parsed.symbol,
      totalSupply: tokenOp.amount.toString(),
      decimals: parsed.decimals,
      creator,
      createdInTx: tx.txid || tx.id,
    },
  });

  // Create initial balance for creator
  await prisma.tokenBalance.create({
    data: {
      address: creator,
      tokenId: tokenOp.tokenId,
      balance: tokenOp.amount.toString(),
    },
  });
}

export async function processTokenTransfer(
  tokenOp: TokenOperation,
  tx: any,
  prisma: PrismaClient
) {
  const fromAddress = extractFromAddress(tx);
  const toAddress = extractToAddress(tx);

  // Get current balances
  const senderBalance = await prisma.tokenBalance.findUnique({
    where: {
      address_tokenId: {
        address: fromAddress,
        tokenId: tokenOp.tokenId,
      },
    },
  });

  const receiverBalance = await prisma.tokenBalance.findUnique({
    where: {
      address_tokenId: {
        address: toAddress,
        tokenId: tokenOp.tokenId,
      },
    },
  });

  // Calculate new balances
  const newSenderBalance = (BigInt(senderBalance?.balance || '0') - tokenOp.amount).toString();
  const newReceiverBalance = (BigInt(receiverBalance?.balance || '0') + tokenOp.amount).toString();

  // Update balances
  await prisma.$transaction([
    // Debit sender
    prisma.tokenBalance.update({
      where: {
        address_tokenId: {
          address: fromAddress,
          tokenId: tokenOp.tokenId,
        },
      },
      data: {
        balance: newSenderBalance,
      },
    }),

    // Credit receiver
    prisma.tokenBalance.upsert({
      where: {
        address_tokenId: {
          address: toAddress,
          tokenId: tokenOp.tokenId,
        },
      },
      create: {
        address: toAddress,
        tokenId: tokenOp.tokenId,
        balance: tokenOp.amount.toString(),
      },
      update: {
        balance: newReceiverBalance,
      },
    }),

    // Record transfer
    prisma.tokenTransfer.create({
      data: {
        txid: tx.txid || tx.id,
        tokenId: tokenOp.tokenId,
        fromAddress,
        toAddress,
        amount: tokenOp.amount.toString(),
        blockHeight: tx.blockHeight,
      },
    }),
  ]);
}

export async function processTokenBurn(
  tokenOp: TokenOperation,
  tx: any,
  prisma: PrismaClient
) {
  const address = extractFromAddress(tx);

  // Get current balance
  const currentBalance = await prisma.tokenBalance.findUnique({
    where: {
      address_tokenId: {
        address,
        tokenId: tokenOp.tokenId,
      },
    },
  });

  // Calculate new balance
  const newBalance = (BigInt(currentBalance?.balance || '0') - tokenOp.amount).toString();

  // Debit balance (burn)
  await prisma.tokenBalance.update({
    where: {
      address_tokenId: {
        address,
        tokenId: tokenOp.tokenId,
      },
    },
    data: {
      balance: newBalance,
    },
  });

  // Record burn as transfer to null address
  await prisma.tokenTransfer.create({
    data: {
      txid: tx.txid || tx.id,
      tokenId: tokenOp.tokenId,
      fromAddress: address,
      toAddress: '0x0000000000000000000000000000000000000000',
      amount: tokenOp.amount.toString(),
      blockHeight: tx.blockHeight,
    },
  });
}

function extractFromAddress(tx: any): string {
  return tx.from || tx.inputs?.[0]?.address || 'unknown';
}

function extractToAddress(tx: any): string {
  return tx.to || tx.outputs?.[0]?.address || 'unknown';
}
