// Copies the contract ABI and bytecode into the React app (run after compiling).
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "..", "frontend", "src", "contracts");

async function exportArtifacts(hre) {
  const artifact = await hre.artifacts.readArtifact("CertificateRegistry");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "CertificateRegistry.json"),
    JSON.stringify({ abi: artifact.abi, bytecode: artifact.bytecode }, null, 2)
  );
  const deploymentsFile = path.join(OUT_DIR, "deployments.json");
  if (!fs.existsSync(deploymentsFile)) fs.writeFileSync(deploymentsFile, "{}\n");
  return OUT_DIR;
}

module.exports = { exportArtifacts, OUT_DIR };

if (require.main === module) {
  const hre = require("hardhat");
  hre
    .run("compile")
    .then(() => exportArtifacts(hre))
    .then((dir) => console.log(`Exported ABI and bytecode to ${dir}`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
}
