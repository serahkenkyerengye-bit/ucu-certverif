// One-command offline demo: starts a local blockchain, deploys the contract and opens the app.
// Usage:  npm run setup   (first time only)
//         npm run demo
const { spawn, execSync } = require("child_process");
const net = require("net");
const path = require("path");

const root = __dirname;

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`This demo needs Node.js 22 or newer, but this computer has ${process.version}.`);
  console.error("Install the LTS version from https://nodejs.org and try again.");
  process.exit(1);
}
const children = [];

function run(cmd, cwd, label) {
  const child = spawn(cmd, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const prefix = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${label}] ${l}`));
  child.stdout.on("data", label === "chain" ? () => {} : prefix);
  child.stderr.on("data", prefix);
  return child;
}

function waitForPort(port, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const s = net.connect(port, "127.0.0.1");
      s.on("connect", () => (s.end(), resolve()));
      s.on("error", () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`Port ${port} did not open`));
        else setTimeout(attempt, 500);
      });
    })();
  });
}

function cleanup() {
  children.forEach((c) => c.kill());
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

(async () => {
  console.log("1/3  Starting local Ethereum network (Hardhat)...");
  run("npx hardhat node", path.join(root, "blockchain"), "chain");
  await waitForPort(8545);

  console.log("2/3  Deploying CertificateRegistry smart contract...");
  execSync("npx hardhat run scripts/deploy.js --network localhost", { cwd: path.join(root, "blockchain"), stdio: "inherit" });

  console.log("3/3  Starting web app...");
  run("npx vite --port 5173 --open", path.join(root, "frontend"), "web");
  await waitForPort(5173);
  console.log("\n  Ready:  http://localhost:5173");
  console.log("  Registrar page -> 'Use local demo account' (no MetaMask needed).");
  console.log("  Other devices on the same Wi-Fi can open the Network address shown above.");
  console.log("  Press Ctrl+C to stop.\n");
})().catch((e) => {
  console.error(e.message);
  cleanup();
});
