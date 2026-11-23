// SPDX-License-Identifier: Apache-2.0
// Chains QDay Radar scans. Bit i of a mask = CHAINS[i].
export type Chain = { id: number; name: string; symbol: string; rpc: string; fallbacks?: string[]; explorer: string };

export const CHAINS: Chain[] = [
  { id: 1, name: "Ethereum", symbol: "ETH", rpc: "https://ethereum-rpc.publicnode.com", fallbacks: ["https://eth.drpc.org", "https://1rpc.io/eth"], explorer: "https://etherscan.io/address/" },
  { id: 8453, name: "Base", symbol: "ETH", rpc: "https://base-rpc.publicnode.com", fallbacks: ["https://mainnet.base.org", "https://base.drpc.org"], explorer: "https://basescan.org/address/" },
  { id: 42161, name: "Arbitrum", symbol: "ETH", rpc: "https://arbitrum-one-rpc.publicnode.com", fallbacks: ["https://arb1.arbitrum.io/rpc"], explorer: "https://arbiscan.io/address/" },
  { id: 10, name: "Optimism", symbol: "ETH", rpc: "https://optimism-rpc.publicnode.com", fallbacks: ["https://mainnet.optimism.io"], explorer: "https://optimistic.etherscan.io/address/" },
  { id: 137, name: "Polygon", symbol: "POL", rpc: "https://polygon-bor-rpc.publicnode.com", fallbacks: ["https://polygon.drpc.org"], explorer: "https://polygonscan.com/address/" },
  { id: 56, name: "BNB Chain", symbol: "BNB", rpc: "https://bsc-rpc.publicnode.com", fallbacks: ["https://bsc-dataseed.bnbchain.org", "https://bsc.drpc.org"], explorer: "https://bscscan.com/address/" },
  { id: 42220, name: "Celo", symbol: "CELO", rpc: "https://forno.celo.org", fallbacks: ["https://celo.drpc.org"], explorer: "https://celoscan.io/address/" },
];

export const QORE_TESTNET = {
  id: 9800,
  name: "QoreChain testnet (qorechain-diana)",
  rpc: "https://evm-testnet.qore.host",
  rest: "https://api-testnet.qore.host",
  explorer: "https://explore.qore.network",
};

export const PQC_KEY_STATUS = "0x0000000000000000000000000000000000000a02";
