/**
 * Token validator - validates token operations
 */

import { PrismaClient } from '@prisma/client';
import { TokenOperation, TokenOpType } from './parser';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export async function validateTokenOperation(
  tokenOp: TokenOperation,
  tx: any,
  prisma: PrismaClient
): Promise<ValidationResult> {
  switch (tokenOp.opType) {
    case TokenOpType.CREATE:
      return validateCreate(tokenOp, tx, prisma);
    
    case TokenOpType.TRANSFER:
      return validateTransfer(tokenOp, tx, prisma);
    
    case TokenOpType.BURN:
      return validateBurn(tokenOp, tx, prisma);
    
    default:
      return { valid: false, reason: 'Unknown operation type' };
  }
}

async function validateCreate(
  tokenOp: TokenOperation,
  tx: any,
  prisma: PrismaClient
): Promise<ValidationResult> {
  // Check if token already exists
  const existing = await prisma.token.findUnique({
    where: { id: tokenOp.tokenId },
  });

  if (existing) {
    return { valid: false, reason: 'Token already exists' };
  }

  return { valid: true };
}

async function validateTransfer(
  tokenOp: TokenOperation,
  tx: any,
  prisma: PrismaClient
): Promise<ValidationResult> {
  // Check if token exists
  const token = await prisma.token.findUnique({
    where: { id: tokenOp.tokenId },
  });

  if (!token) {
    return { valid: false, reason: 'Token does not exist' };
  }

  // Check sender balance
  const fromAddress = extractFromAddress(tx);
  const balance = await prisma.tokenBalance.findUnique({
    where: {
      address_tokenId: {
        address: fromAddress,
        tokenId: tokenOp.tokenId,
      },
    },
  });

  if (!balance || BigInt(balance.balance) < tokenOp.amount) {
    return { valid: false, reason: 'Insufficient balance' };
  }

  return { valid: true };
}

async function validateBurn(
  tokenOp: TokenOperation,
  tx: any,
  prisma: PrismaClient
): Promise<ValidationResult> {
  // Similar to transfer validation
  const token = await prisma.token.findUnique({
    where: { id: tokenOp.tokenId },
  });

  if (!token) {
    return { valid: false, reason: 'Token does not exist' };
  }

  const address = extractFromAddress(tx);
  const balance = await prisma.tokenBalance.findUnique({
    where: {
      address_tokenId: {
        address,
        tokenId: tokenOp.tokenId,
      },
    },
  });

  if (!balance || BigInt(balance.balance) < tokenOp.amount) {
    return { valid: false, reason: 'Insufficient balance to burn' };
  }

  return { valid: true };
}

function extractFromAddress(tx: any): string {
  // TODO: Extract from address from transaction
  // This depends on transaction format from Arkade indexer
  return tx.from || tx.inputs?.[0]?.address || 'unknown';
}
