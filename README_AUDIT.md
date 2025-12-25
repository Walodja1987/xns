# Design Choices

The contract was developed with simplicity and readability in mind. Key decisions include:
* Using `require` statements with descriptive error strings instead of custom errors.
* Keeping interfaces and implementations separate to improve code clarity and avoid variable duplication (e.g., `RegisterNameAuth` is defined in `IXNS.sol` and not redeclared in `XNS.sol`, maintaining struct definitions in only one place).
* Assigning a fixed contract owner (intended to be a multisig) for straightforward governance.
* Avoiding inline assembly for hash computations to enhance maintainability and understandability.

## Additional Considerations
* The batch registration function intentionally only supports batching within the same namespace, as this matches the most common use case—especially after a new namespace is registered.
* **Error handling in `batchRegisterNameWithAuthorization`**: The `batchRegisterNameWithAuthorization` function uses a hybrid approach: input validation errors (invalid label, zero recipient, namespace mismatch, invalid signature) cause the entire batch to revert, while state-based conflicts (recipient already has a name, name already registered) are skipped to continue processing. This design provides griefing resistance—if someone front-runs the transaction and registers a name for one recipient, that registration is skipped and other valid registrations proceed. The function only charges for successful registrations and requires at least one to succeed. The function returns the number of successful items processed. If it doesn't match the expected number, the user can inspect the events which are emitted for every processed item, and not if skipped.
* `batchRegisterNameWithAuthorization`: Instead of returning 0 when no registrations succeed, the function actively reverts with a clear error message. This ensures users are immediately notified of failure, eliminates the edge case of silent zero-success outcomes, and simplifies the refund logic, since no payment processing or refund needs to take place when nothing is successfully registered. This choice streamlines the code and makes error handling more predictable.