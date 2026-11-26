import deployments from "../contracts/deployments.json";
import artifact from "../contracts/CertificateRegistry.json";

export const ABI = artifact.abi;
export const BYTECODE = artifact.bytecode;

export const NETWORKS = {
  31337: {
    name: "Local Hardhat network",
    short: "Local",
    rpc: import.meta.env.VITE_LOCAL_RPC || "http://127.0.0.1:8545",
    explorer: null,
    currency: "ETH",
  },
  11155111: {
    name: "Ethereum Sepolia test network",
    short: "Sepolia",
    rpc: import.meta.env.VITE_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    currency: "SepoliaETH",
  },
};

/** Which network this build talks to. Hosted builds use Sepolia; local demo uses Hardhat. */
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 31337);
export const NETWORK = NETWORKS[CHAIN_ID];

const LS_REGISTRY = `ucu-registry-${CHAIN_ID}`;

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Contract address: build setting, then deployments.json, then one saved by an in-browser deploy. */
export function getRegistry() {
  const fromEnv = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (fromEnv) return { address: fromEnv, block: Number(import.meta.env.VITE_CONTRACT_BLOCK || 0) };
  const d = deployments[String(CHAIN_ID)];
  if (d?.address) return { address: d.address, block: d.block || 0 };
  const saved = safeGet(LS_REGISTRY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function saveRegistry(address, block) {
  try {
    localStorage.setItem(LS_REGISTRY, JSON.stringify({ address, block }));
  } catch {
    /* ignore */
  }
}

export const INSTITUTION = "Uganda Christian University";

export function explorerTx(hash) {
  return NETWORK?.explorer ? `${NETWORK.explorer}/tx/${hash}` : null;
}
export function explorerAddress(addr) {
  return NETWORK?.explorer ? `${NETWORK.explorer}/address/${addr}` : null;
}
