import { BrowserProvider, Contract, ContractFactory, JsonRpcProvider, toBeHex } from "ethers";
import { ABI, BYTECODE, CHAIN_ID, NETWORK, getRegistry, saveRegistry } from "./config";

export const STATUS = ["None", "Issued", "Revoked"];

let readProvider;
/** Read-only provider: verification needs no wallet, account or fee (FR5). */
export function getReadProvider() {
  if (!readProvider) readProvider = new JsonRpcProvider(NETWORK.rpc, CHAIN_ID, { staticNetwork: true });
  return readProvider;
}

export function getReadContract() {
  const reg = getRegistry();
  if (!reg) throw new Error("No certificate registry is configured for this network yet.");
  return new Contract(reg.address, ABI, getReadProvider());
}

/** Looks a certificate up on-chain. Returns null when the hash was never issued. */
export async function lookupCertificate(certHash) {
  const c = getReadContract();
  const r = await c.verifyCertificate(certHash);
  if (!r.exists) return null;
  return {
    certHash,
    status: STATUS[Number(r.status)],
    programme: r.programme,
    issueDate: Number(r.issueDate),
    ipfsCID: r.ipfsCID,
    issuer: r.issuer,
    revocationReason: r.revocationReason,
  };
}

export function hasMetaMask() {
  return typeof window !== "undefined" && !!window.ethereum;
}

/** Connects MetaMask and switches it to the configured network. */
export async function connectMetaMask() {
  if (!hasMetaMask()) throw new Error("MetaMask is not installed in this browser.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const hexId = toBeHex(CHAIN_ID);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (err) {
    if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: NETWORK.name,
            rpcUrls: [NETWORK.rpc],
            nativeCurrency: { name: NETWORK.currency, symbol: "ETH", decimals: 18 },
            blockExplorerUrls: NETWORK.explorer ? [NETWORK.explorer] : [],
          },
        ],
      });
    } else {
      throw err;
    }
  }
  const provider = new BrowserProvider(window.ethereum);
  return provider.getSigner();
}

/** Local demo only: uses the first unlocked Hardhat account, no wallet extension needed. */
export async function connectLocalDemoAccount() {
  if (CHAIN_ID !== 31337) throw new Error("The demo account only exists on the local network.");
  return getReadProvider().getSigner(0);
}

export function getWriteContract(signer) {
  const reg = getRegistry();
  return new Contract(reg.address, ABI, signer);
}

export async function getRoles(signer) {
  const c = getWriteContract(signer);
  const addr = await signer.getAddress();
  const [issuerRole, adminRole] = await Promise.all([c.ISSUER_ROLE(), c.DEFAULT_ADMIN_ROLE()]);
  const [isIssuer, isAdmin] = await Promise.all([c.hasRole(issuerRole, addr), c.hasRole(adminRole, addr)]);
  return { address: addr, isIssuer, isAdmin };
}

/** Deploys a new registry from the browser, making the connected wallet the administrator. */
export async function deployRegistry(signer) {
  const factory = new ContractFactory(ABI, BYTECODE, signer);
  const contract = await factory.deploy(await signer.getAddress());
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  saveRegistry(address, receipt.blockNumber);
  return { address, block: receipt.blockNumber, txHash: receipt.hash };
}

/** Lists every issuance and revocation event (FR9 audit trail). */
export async function loadHistory(minBlock) {
  const c = getReadContract();
  const from = getRegistry().block || 0;
  // The provider caches the latest block number for a few seconds; after a transaction we
  // pass its block so the new event is always included.
  const latest = await getReadProvider().getBlockNumber();
  const to = Math.max(latest, minBlock || 0);
  // Public RPC nodes limit how many blocks one log query may cover, so read in chunks.
  const STEP = CHAIN_ID === 31337 ? Number.MAX_SAFE_INTEGER : 40000;
  const issued = [];
  const revoked = [];
  for (let start = from; start <= to; start += STEP) {
    const end = Math.min(to, start + STEP - 1);
    const [i, r] = await Promise.all([
      c.queryFilter(c.filters.CertificateIssued(), start, end),
      c.queryFilter(c.filters.CertificateRevoked(), start, end),
    ]);
    issued.push(...i);
    revoked.push(...r);
  }
  const revokedMap = new Map(revoked.map((e) => [e.args.certHash, e.args.reason]));
  const certs = issued
    .map((e) => ({
      certHash: e.args.certHash,
      programme: e.args.programme,
      issueDate: Number(e.args.issueDate),
      ipfsCID: e.args.ipfsCID,
      issuer: e.args.issuer,
      txHash: e.transactionHash,
      blockNumber: e.blockNumber,
      revoked: revokedMap.has(e.args.certHash),
      revocationReason: revokedMap.get(e.args.certHash) || "",
    }))
    .reverse();
  const events = [
    ...issued.map((e) => ({ type: "Issued", certHash: e.args.certHash, by: e.args.issuer, txHash: e.transactionHash, blockNumber: e.blockNumber })),
    ...revoked.map((e) => ({ type: "Revoked", certHash: e.args.certHash, by: e.args.revokedBy, reason: e.args.reason, txHash: e.transactionHash, blockNumber: e.blockNumber })),
  ].sort((a, b) => b.blockNumber - a.blockNumber);
  const [totalIssued, totalRevoked] = await Promise.all([c.totalIssued(), c.totalRevoked()]);
  return { certs, events, totalIssued: Number(totalIssued), totalRevoked: Number(totalRevoked) };
}

const FRIENDLY = {
  AccessControlUnauthorizedAccount: "This wallet is not an authorised Registrar administrator.",
  CertificateAlreadyExists: "A certificate with this hash is already recorded.",
  CertificateNotFound: "No certificate with this reference exists.",
  CertificateAlreadyRevoked: "This certificate has already been revoked.",
  EmptyField: "A required field is empty.",
  InvalidAddress: "That wallet address is not valid for this action.",
};

/** Turns wallet and contract errors into plain English. */
export function friendlyError(err) {
  if (!err) return "Unknown error";
  if (err.code === "ACTION_REJECTED" || err.code === 4001) return "You cancelled the request in your wallet.";
  const data = err.data || err.info?.error?.data || err.error?.data;
  if (data && typeof data === "string") {
    try {
      const parsed = getReadContract().interface.parseError(data);
      if (parsed) return FRIENDLY[parsed.name] || parsed.name;
    } catch {
      /* fall through */
    }
  }
  if (err.revert?.name) return FRIENDLY[err.revert.name] || err.revert.name;
  if (err.code === "INSUFFICIENT_FUNDS") return "The wallet does not have enough test ETH to pay the transaction fee.";
  if (err.code === "NETWORK_ERROR" || /failed to fetch|ECONNREFUSED/i.test(err.message || ""))
    return `Cannot reach the ${NETWORK.name}. Check the internet connection (or that the local node is running).`;
  return err.shortMessage || err.reason || err.message || String(err);
}
