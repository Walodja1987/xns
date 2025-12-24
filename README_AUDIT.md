# Design Choices

The contract was developed with simplicity and readability in mind. Key decisions include:
* Using `require` statements with descriptive error strings instead of custom errors.
* Keeping interfaces and implementations separate to improve code clarity and avoid variable duplication (e.g., `RegisterNameAuth` is defined in `IXNS.sol` and not redeclared in `XNS.sol`, maintaining struct definitions in only one place).
* Assigning a fixed contract owner (intended to be a multisig) for straightforward governance.
* Avoiding inline assembly for hash computations to enhance maintainability and understandability.

## Additional Considerations
* The batch registration function intentionally only supports batching within the same namespace, as this matches the most common use case—especially after a new namespace is registered.