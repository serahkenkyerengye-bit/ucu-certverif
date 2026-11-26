// Deploys CertificateRegistry and records its address in the React app.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { exportArtifacts, OUT_DIR } = require("./export");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const { chainId } = await hre.ethers.provider.getNetwork();
  console.log(`Deploying from ${deployer.address} on chain ${chainId} (${hre.network.name})...`);

  const Registry = await hre.ethers.getContractFactory("CertificateRegistry");
  const registry = await Registry.deploy(deployer.address);
  const receipt = await registry.deploymentTransaction().wait();
  const address = await registry.getAddress();
  console.log(`CertificateRegistry deployed to ${address} in block ${receipt.blockNumber}`);

  await exportArtifacts(hre);
  const file = path.join(OUT_DIR, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(file, "utf8"));
  deployments[chainId.toString()] = {
    address,
    block: receipt.blockNumber,
    network: hre.network.name,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(deployments, null, 2) + "\n");
  console.log(`Saved deployment to ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
