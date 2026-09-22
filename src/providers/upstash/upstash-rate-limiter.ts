import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import type { RateLimiter, RateLimitResult } from "@/application/contracts";

export class UpstashAnonymousRateLimiter implements RateLimiter {
  private readonly ipLimiter: Ratelimit;
  private readonly deviceLimiter: Ratelimit;

  constructor(input: { url: string; token: string }) {
    const redis = new Redis(input);
    this.ipLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "24 h"),
      prefix: "menugen:anonymous:ip",
      analytics: false,
    });
    this.deviceLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "24 h"),
      prefix: "menugen:anonymous:device",
      analytics: false,
    });
  }

  async checkAnonymousExtraction(input: {
    ipAddress: string;
    deviceToken: string;
  }) {
    const [ip, device] = await Promise.all([
      this.ipLimiter.limit(input.ipAddress),
      this.deviceLimiter.limit(input.deviceToken),
    ]);
    return { ip: toResult(ip), device: toResult(device) };
  }
}

function toResult(result: {
  success: boolean;
  remaining: number;
  reset: number;
}): RateLimitResult {
  return {
    allowed: result.success,
    remaining: result.remaining,
    resetAt: new Date(result.reset).toISOString(),
  };
}
