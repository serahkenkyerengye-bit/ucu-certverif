// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title CertificateRegistry
/// @notice Records the hashes of academic certificates issued by Uganda Christian
///         University so that anyone can verify them without contacting the Registrar.
/// @dev    No personal data is stored on-chain. Each record holds only the certificate
///         hash, the IPFS content identifier of the encrypted document, the programme,
///         the issue date, the issuer and the status.
contract CertificateRegistry is AccessControl {
    /// @notice Role held by authorised Registrar staff who may issue and revoke.
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    enum Status {
        None,
        Issued,
        Revoked
    }

    struct Certificate {
        string ipfsCID;
        string programme;
        uint256 issueDate;
        address issuer;
        Status status;
        string revocationReason;
    }

    mapping(bytes32 => Certificate) private _certificates;

    uint256 public totalIssued;
    uint256 public totalRevoked;

    event CertificateIssued(
        bytes32 indexed certHash,
        string programme,
        uint256 issueDate,
        string ipfsCID,
        address indexed issuer
    );
    event CertificateRevoked(bytes32 indexed certHash, string reason, address indexed revokedBy);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    error CertificateAlreadyExists(bytes32 certHash);
    error CertificateNotFound(bytes32 certHash);
    error CertificateAlreadyRevoked(bytes32 certHash);
    error EmptyField(string field);
    error InvalidAddress();

    constructor(address admin) {
        if (admin == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
    }

    /// @notice Records a new certificate (FR1, FR2, FR4).
    function issueCertificate(
        bytes32 certHash,
        string calldata programme,
        uint256 issueDate,
        string calldata ipfsCID
    ) external onlyRole(ISSUER_ROLE) {
        if (certHash == bytes32(0)) revert EmptyField("certHash");
        if (bytes(programme).length == 0) revert EmptyField("programme");
        if (bytes(ipfsCID).length == 0) revert EmptyField("ipfsCID");
        if (_certificates[certHash].status != Status.None) revert CertificateAlreadyExists(certHash);

        _certificates[certHash] = Certificate({
            ipfsCID: ipfsCID,
            programme: programme,
            issueDate: issueDate,
            issuer: msg.sender,
            status: Status.Issued,
            revocationReason: ""
        });
        unchecked {
            totalIssued++;
        }
        emit CertificateIssued(certHash, programme, issueDate, ipfsCID, msg.sender);
    }

    /// @notice Revokes a certificate and records the reason (FR7). The record stays visible.
    function revokeCertificate(bytes32 certHash, string calldata reason) external onlyRole(ISSUER_ROLE) {
        Certificate storage cert = _certificates[certHash];
        if (cert.status == Status.None) revert CertificateNotFound(certHash);
        if (cert.status == Status.Revoked) revert CertificateAlreadyRevoked(certHash);
        if (bytes(reason).length == 0) revert EmptyField("reason");

        cert.status = Status.Revoked;
        cert.revocationReason = reason;
        unchecked {
            totalRevoked++;
        }
        emit CertificateRevoked(certHash, reason, msg.sender);
    }

    /// @notice Read-only verification that anyone can call without a wallet or fee (FR5, FR6).
    function verifyCertificate(bytes32 certHash)
        external
        view
        returns (
            bool exists,
            Status status,
            string memory programme,
            uint256 issueDate,
            string memory ipfsCID,
            address issuer,
            string memory revocationReason
        )
    {
        Certificate storage cert = _certificates[certHash];
        return (
            cert.status != Status.None,
            cert.status,
            cert.programme,
            cert.issueDate,
            cert.ipfsCID,
            cert.issuer,
            cert.revocationReason
        );
    }

    /// @notice Hands the administrator role to a new address without redeploying (FR10).
    function transferAdminRole(address newAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newAdmin == address(0) || newAdmin == msg.sender) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        _grantRole(ISSUER_ROLE, newAdmin);
        _revokeRole(ISSUER_ROLE, msg.sender);
        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
        emit AdminTransferred(msg.sender, newAdmin);
    }
}
