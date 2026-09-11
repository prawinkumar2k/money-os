/**
 * Market-data provider abstraction. No real market-data API is wired up yet (that requires a
 * paid/credentialed provider — e.g. a stock/mutual-fund price feed). Until one is connected,
 * ManualPriceProvider is the only implementation: prices are whatever the user enters, and every
 * investment is flagged isManualPrice so the UI never presents a manually-entered value as a
 * live market price.
 */
export interface MarketDataProvider {
  readonly id: string;
  getPrice(symbol: string): Promise<{ price: number; asOf: Date } | null>;
}

export class ManualPriceProvider implements MarketDataProvider {
  readonly id = "manual";

  async getPrice(): Promise<null> {
    // No live feed — callers must fall back to a user-entered price and mark it manual.
    return null;
  }
}

export function getMarketDataProvider(): MarketDataProvider {
  return new ManualPriceProvider();
}
