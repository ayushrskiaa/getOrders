export const platforms = ["AMAZON", "FLIPKART", "ZEPTO"] as const;

export type Platform = (typeof platforms)[number];
