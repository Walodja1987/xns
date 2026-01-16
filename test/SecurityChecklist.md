# Potential Vulnerabilities & Unintended Behaviors

This document outlines potential attack vectors and unintended behaviors that should be verified during security review. Each item represents a class of vulnerabilities that could compromise the contract's intended functionality.

* ways to register **without paying** or pay the wrong amount (refund math / requiredAmount / batch),
* ways to bypass **one-name-per-address**,
* ways to bypass **private namespace creator-only** enforcement,
* ways to bypass **exclusivity**,
* signature replay / cross-chain / cross-contract issues (EIP-712 domain separation),
* parsing issues in `getAddress(fullName)` (bare names, multiple dots, empty parts),
* ways to create "ghost namespaces" or collide namespaces.