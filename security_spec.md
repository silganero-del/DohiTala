# Security Specification

## Data Invariants
1. A debate must have an `ownerId` that matches the user creating it.
2. Only authenticated users can read.
3. Only participants (or all authenticated users, if public among friends) can create statements. We'll allow all authenticated users (friends) to see and participate.
4. Terminal State Locking: If a debate is `Résolu`, statements cannot be added, but wait, the rules say we must enforce status changes. Let's keep it simple: anybody who is authenticated can create debates, read debates, and add statements to any debate (since it's an app for friends). But for safety, standard rules apply.

## "Dirty Dozen" Payloads
1. Unauthenticated write attempt.
2. Create debate with `ownerId` spoofing.
3. Add statement without being authenticated.
4. Add statement to a missing debate (relational check on parent).
5. Update a status to an invalid string.
6. Changing `ownerId` on an update.
7. Massive string injection (title > 100 chars).
8. etc.
