# UCU CertVerify

**Blockchain-Based Academic Certificate Verification System using Ethereum and ReactJS**
Final-year IT research project, Uganda Christian University, by Kenkyerengye Sellah (S25B13/040).

Uganda Christian University (UCU) records each certificate's hash on Ethereum. The certificate document itself is
encrypted and stored on IPFS. Anyone can check a certificate with its reference, link, QR code or file, without an
account, a wallet or a fee.

| Role | What they can do | Login |
|---|---|---|
| Registrar (Administrator) | Issue certificates, revoke them with a reason, view the audit trail, transfer the admin role | MetaMask wallet holding the admin role in the smart contract |
| Graduate | Open, print, download and share their certificate (link and QR code) | None: uses the certificate link |
| Employer / Verifier | Verify by reference, link, QR code or certificate file: **Valid / Revoked / Not found** | None |

## Project structure

```
blockchain/   Solidity smart contract (CertificateRegistry.sol), Hardhat tests, deploy scripts
frontend/     React (Vite) web app: ethers.js, MetaMask, AES-256 encryption, IPFS, QR codes
demo.js       One-command offline demo (local blockchain + web app)
.github/      GitHub Actions: runs the contract tests and publishes the app to GitHub Pages
```

## Run the demo on any laptop (offline)

You need [Node.js 22 or newer](https://nodejs.org) (download the **LTS** version). Then run:

```bash
npm run setup     # first time only: installs everything
npm run demo      # starts the local blockchain, deploys the contract and opens http://localhost:5173
```

On the **Registrar** page, click **Use local demo account**. You don't need MetaMask for the local demo.
Phones on the same Wi-Fi can open the "Network" address that the terminal shows.

## Tests

```bash
npm test                              # 15 smart-contract tests
cd blockchain && npx hardhat coverage # 100% statement, branch, function and line coverage
```

## Online version (Sepolia test network + GitHub Pages)

The workflow in `.github/workflows/deploy.yml` runs the tests and publishes the app to GitHub Pages on every
push to `main`. The online app uses the **Ethereum Sepolia test network**.

1. **Enable Pages.** In the GitHub repo, go to Settings → Pages → Source and choose **GitHub Actions**.
2. **Set up the demo wallet.** Install MetaMask, create a *separate demo wallet*, and get free Sepolia test ETH
   from a faucet (e.g. Google Cloud Web3 faucet).
3. **Deploy the contract.** Open the published site, go to **Registrar**, connect MetaMask, and click
   **Deploy registry contract**. Copy the address and block number it shows.
4. **Save the contract address.** In the GitHub repo, go to Settings → Secrets and variables → Actions →
   **Variables**. Add `CONTRACT_ADDRESS` and `CONTRACT_BLOCK`, then re-run the workflow. Every computer
   now uses that contract.
5. **Set up IPFS storage.** Create a free [Pinata](https://pinata.cloud) API key (JWT). Either paste it on the
   Registrar page under **Settings**, which saves it in that browser only, or add it as the Actions **secret**
   `PINATA_JWT`. Note that a key added as a build secret ends up inside the public JavaScript, so give it upload
   permission only.

### Using someone else's computer

- **Verifying** and **viewing a certificate** work in any browser or phone. You don't need to log in.
- **Registrar actions:**
  1. Install the MetaMask extension.
  2. Choose *Import wallet* and enter the demo wallet's recovery phrase.
  3. After the demo, remove the wallet from MetaMask and press **Forget** next to the Pinata key.

  Only ever use a demo wallet that holds test ETH, never a wallet with real money.

## Security and privacy design

- No personal data on-chain. The chain stores only the hash, programme, issue date, IPFS CID, issuer and status.
- The certificate is encrypted in the browser with AES-256-GCM. The key travels only in the link after `#`,
  which browsers never send to a server.
- The hash includes a random salt, so nobody can guess it from known student details. The salt is stored
  inside the encrypted document so the hash can be recomputed during verification.
- Access control uses OpenZeppelin `AccessControl` and is enforced by the contract, not the website.
- Duplicate hashes are rejected. Revoked certificates stay visible as revoked.

## Performance logging

The app times every issuance (from transaction submission to confirmation, plus gas used) and every
verification. To export the results for the evaluation chapter, go to Registrar → Settings → **Download CSV**.
