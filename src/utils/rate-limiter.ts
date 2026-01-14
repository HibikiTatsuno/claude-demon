/**
 * Token bucket rate limiter for API calls
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  /**
   * Creates a new rate limiter
   * @param maxPerMinute Maximum number of requests allowed per minute
   */
  constructor(maxPerMinute: number) {
    this.maxTokens = maxPerMinute;
    this.tokens = maxPerMinute;
    this.refillRate = maxPerMinute / 60; // tokens per second
    this.lastRefill = Date.now();
  }

  /**
   * Acquires a token, waiting if necessary
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens < 1) {
      const waitTime = ((1 - this.tokens) / this.refillRate) * 1000;
      await this.sleep(waitTime);
      this.refill();
    }

    this.tokens -= 1;
  }

  /**
   * Tries to acquire a token without waiting
   * @returns true if token was acquired, false otherwise
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Gets the current number of available tokens
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Refills tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;
  }

  /**
   * Sleeps for the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
