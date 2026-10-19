import crypto from 'node:crypto';
import { GuestSessionRepository } from '../db/repositories/guestSessionRepository.js';
import { config } from '../config.js';

export class GuestService {
  constructor(guestRepo = null) {
    this.guestRepo = guestRepo || new GuestSessionRepository();
    this.maxUses = config.MAX_GUEST_USES;
  }

  generateSessionId() {
    return 'gst_' + crypto.randomBytes(16).toString('hex');
  }

  getUsageStatus(sessionId) {
    if (!sessionId) {
      return {
        usageCount: 0,
        maxUses: this.maxUses,
        remainingUses: this.maxUses,
        isExhausted: false,
        message: `Free debugging uses remaining: ${this.maxUses}`
      };
    }

    const usageCount = this.guestRepo.getUsageCount(sessionId);
    const remainingUses = Math.max(0, this.maxUses - usageCount);
    const isExhausted = remainingUses === 0;

    let message;
    if (remainingUses === 2) {
      message = 'Free debugging uses remaining: 2';
    } else if (remainingUses === 1) {
      message = 'Free debugging uses remaining: 1';
    } else {
      message = 'You have used your 2 free debugging attempts.';
    }

    return {
      usageCount,
      maxUses: this.maxUses,
      remainingUses,
      isExhausted,
      message
    };
  }

  /**
   * Concurrency-safe atomic attempt reservation.
   * Returns { allowed: boolean, usageCount: number, remainingUses: number }
   */
  reserveAttempt(sessionId) {
    if (!sessionId) {
      return { allowed: false, remainingUses: 0, error: 'NO_SESSION' };
    }

    const success = this.guestRepo.reserveAttempt(sessionId, this.maxUses);
    const usageCount = this.guestRepo.getUsageCount(sessionId);
    const remainingUses = Math.max(0, this.maxUses - usageCount);

    if (!success) {
      return {
        allowed: false,
        usageCount,
        remainingUses: 0,
        error: 'LOGIN_REQUIRED',
        message: "You've used your 2 free debugging attempts. Please log in or create a free account to continue debugging your code."
      };
    }

    return {
      allowed: true,
      usageCount,
      remainingUses
    };
  }

  refundAttempt(sessionId) {
    if (sessionId) {
      this.guestRepo.refundAttempt(sessionId);
    }
  }

  resetSession(sessionId) {
    if (sessionId) {
      this.guestRepo.resetUsage(sessionId);
    }
  }
}
