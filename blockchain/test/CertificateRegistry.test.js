const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CertificateRegistry", function () {
  const PROGRAMME = "Bachelor of Science in Information Technology";
  const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
  const hashOf = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
  const STATUS = { None: 0n, Issued: 1n, Revoked: 2n };

  async function deploy() {
    const [admin, outsider, newAdmin] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("CertificateRegistry");
    const registry = await Registry.deploy(admin.address);
    const issueDate = BigInt(Math.floor(Date.now() / 1000));
    return { registry, admin, outsider, newAdmin, issueDate };
  }

  describe("Deployment", function () {
    it("gives the deployer the admin and issuer roles", async function () {
      const { registry, admin } = await loadFixture(deploy);
      expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
      expect(await registry.hasRole(await registry.ISSUER_ROLE(), admin.address)).to.be.true;
    });

    it("rejects the zero address as admin", async function () {
      const Registry = await ethers.getContractFactory("CertificateRegistry");
      await expect(Registry.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        Registry,
        "InvalidAddress"
      );
    });
  });

  describe("Issuing (FR1, FR2, FR4)", function () {
    it("lets the administrator issue a certificate and emits an event", async function () {
      const { registry, admin, issueDate } = await loadFixture(deploy);
      const h = hashOf("cert-1");
      await expect(registry.issueCertificate(h, PROGRAMME, issueDate, CID))
        .to.emit(registry, "CertificateIssued")
        .withArgs(h, PROGRAMME, issueDate, CID, admin.address);
      expect(await registry.totalIssued()).to.equal(1n);
    });

    it("stores the hash, CID, programme, date and issuer", async function () {
      const { registry, admin, issueDate } = await loadFixture(deploy);
      const h = hashOf("cert-1");
      await registry.issueCertificate(h, PROGRAMME, issueDate, CID);
      const r = await registry.verifyCertificate(h);
      expect(r.exists).to.be.true;
      expect(r.status).to.equal(STATUS.Issued);
      expect(r.programme).to.equal(PROGRAMME);
      expect(r.issueDate).to.equal(issueDate);
      expect(r.ipfsCID).to.equal(CID);
      expect(r.issuer).to.equal(admin.address);
    });

    it("blocks issuance by an account without the issuer role", async function () {
      const { registry, outsider, issueDate } = await loadFixture(deploy);
      await expect(
        registry.connect(outsider).issueCertificate(hashOf("x"), PROGRAMME, issueDate, CID)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("rejects a duplicate certificate hash", async function () {
      const { registry, issueDate } = await loadFixture(deploy);
      const h = hashOf("cert-1");
      await registry.issueCertificate(h, PROGRAMME, issueDate, CID);
      await expect(registry.issueCertificate(h, PROGRAMME, issueDate, CID))
        .to.be.revertedWithCustomError(registry, "CertificateAlreadyExists")
        .withArgs(h);
    });

    it("rejects empty fields", async function () {
      const { registry, issueDate } = await loadFixture(deploy);
      await expect(
        registry.issueCertificate(ethers.ZeroHash, PROGRAMME, issueDate, CID)
      ).to.be.revertedWithCustomError(registry, "EmptyField");
      await expect(
        registry.issueCertificate(hashOf("a"), "", issueDate, CID)
      ).to.be.revertedWithCustomError(registry, "EmptyField");
      await expect(
        registry.issueCertificate(hashOf("a"), PROGRAMME, issueDate, "")
      ).to.be.revertedWithCustomError(registry, "EmptyField");
    });
  });

  describe("Verifying (FR5, FR6)", function () {
    it("returns 'not found' for a forged or never-issued certificate", async function () {
      const { registry } = await loadFixture(deploy);
      const r = await registry.verifyCertificate(hashOf("forged"));
      expect(r.exists).to.be.false;
      expect(r.status).to.equal(STATUS.None);
    });

    it("detects tampering: a changed document gives a different hash", async function () {
      const { registry, issueDate } = await loadFixture(deploy);
      await registry.issueCertificate(hashOf('{"name":"Jane","class":"Second Upper"}'), PROGRAMME, issueDate, CID);
      const tampered = await registry.verifyCertificate(hashOf('{"name":"Jane","class":"First Class"}'));
      expect(tampered.exists).to.be.false;
    });

    it("can be called by anyone, without the issuer role", async function () {
      const { registry, outsider, issueDate } = await loadFixture(deploy);
      const h = hashOf("cert-1");
      await registry.issueCertificate(h, PROGRAMME, issueDate, CID);
      const r = await registry.connect(outsider).verifyCertificate(h);
      expect(r.exists).to.be.true;
    });
  });

  describe("Revoking (FR7)", function () {
    it("revokes a certificate, keeps it visible and records the reason", async function () {
      const { registry, admin, issueDate } = await loadFixture(deploy);
      const h = hashOf("cert-1");
      await registry.issueCertificate(h, PROGRAMME, issueDate, CID);
      await expect(registry.revokeCertificate(h, "Academic misconduct"))
        .to.emit(registry, "CertificateRevoked")
        .withArgs(h, "Academic misconduct", admin.address);
      const r = await registry.verifyCertificate(h);
      expect(r.exists).to.be.true;
      expect(r.status).to.equal(STATUS.Revoked);
      expect(r.revocationReason).to.equal("Academic misconduct");
      expect(await registry.totalRevoked()).to.equal(1n);
    });

    it("blocks revocation by an outsider", async function () {
      const { registry, outsider, issueDate } = await loadFixture(deploy);
      const h = hashOf("cert-1");
      await registry.issueCertificate(h, PROGRAMME, issueDate, CID);
      await expect(
        registry.connect(outsider).revokeCertificate(h, "x")
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("rejects revoking an unknown or already revoked certificate, or with no reason", async function () {
      const { registry, issueDate } = await loadFixture(deploy);
      const h = hashOf("cert-1");
      await expect(registry.revokeCertificate(h, "x")).to.be.revertedWithCustomError(
        registry,
        "CertificateNotFound"
      );
      await registry.issueCertificate(h, PROGRAMME, issueDate, CID);
      await expect(registry.revokeCertificate(h, "")).to.be.revertedWithCustomError(registry, "EmptyField");
      await registry.revokeCertificate(h, "Error in record");
      await expect(registry.revokeCertificate(h, "again")).to.be.revertedWithCustomError(
        registry,
        "CertificateAlreadyRevoked"
      );
    });
  });

  describe("Admin transfer (FR10)", function () {
    it("moves both roles to the new admin and removes them from the old one", async function () {
      const { registry, admin, newAdmin, issueDate } = await loadFixture(deploy);
      await expect(registry.transferAdminRole(newAdmin.address))
        .to.emit(registry, "AdminTransferred")
        .withArgs(admin.address, newAdmin.address);
      const ISSUER = await registry.ISSUER_ROLE();
      const ADMIN = await registry.DEFAULT_ADMIN_ROLE();
      expect(await registry.hasRole(ISSUER, newAdmin.address)).to.be.true;
      expect(await registry.hasRole(ADMIN, newAdmin.address)).to.be.true;
      expect(await registry.hasRole(ISSUER, admin.address)).to.be.false;
      expect(await registry.hasRole(ADMIN, admin.address)).to.be.false;
      await expect(
        registry.issueCertificate(hashOf("a"), PROGRAMME, issueDate, CID)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await registry.connect(newAdmin).issueCertificate(hashOf("a"), PROGRAMME, issueDate, CID);
    });

    it("rejects the zero address, self-transfer and outsiders", async function () {
      const { registry, admin, outsider } = await loadFixture(deploy);
      await expect(registry.transferAdminRole(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        registry,
        "InvalidAddress"
      );
      await expect(registry.transferAdminRole(admin.address)).to.be.revertedWithCustomError(
        registry,
        "InvalidAddress"
      );
      await expect(
        registry.connect(outsider).transferAdminRole(outsider.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });
});
