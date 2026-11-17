# Murmur

**Anonymous, verified feedback for teams, built on [Midnight](https://midnight.network).**

Only enrolled members can post, and nobody, including the admin, can tell which member wrote a report. Each member can post once per round, endorse each report once, and follow up on their own reports later. The admin acknowledges and resolves reports in public.

- **Live demo:** https://emilpz320-a11y.github.io/murmur-midnight/ (runs the compiled contract in your browser)
- **Contract:** [`contract/murmur.compact`](contract/murmur.compact)
- **Tests:** [`src/test/murmur.test.ts`](src/test/murmur.test.ts), 13 tests, run in CI on every push
- **Video (2:50):** [`docs/murmur-demo.mp4`](docs/murmur-demo.mp4) · **Slides:** [`docs/murmur-deck.pdf`](docs/murmur-deck.pdf)

## The problem

Teams want honest feedback: a missed safety step, a manager problem, a process that keeps failing. Today the choice is bad either way:

- **Named feedback** is trusted, but people hold back.
- **Anonymous forms** get candour, but anyone can post, one person can post fifty times, and the operator of the form can usually see who wrote what.

Murmur gives both properties at once: every report is provably from a real member, at most one per member per round, and the link from report to member never exists anywhere, not even on the operator's server.

## How it works

Midnight contracts have two kinds of state, and Murmur uses both:

| Public ledger (on chain, visible to everyone) | Private state (only on the member's device) |
|---|---|
| The admin key, the member keys, a Merkle tree of member keys | Each person's 32-byte secret key |
| Reports, their round, status, endorsement count, follow-ups and admin replies | The Merkle path of their own member key (computed locally) |
| Spent nullifiers, and one author tag per report | |

1. **Enrol.** Each member derives `memberKey = H("murmur:member", secret)` and gives it to the admin. The admin enrols it: it is added to the `members` Merkle tree. The secret never leaves the member's device.
2. **Post.** The `post` circuit takes the secret from the private-state witness and proves in zero knowledge that `memberKey(secret)` is a leaf of the current members tree, without revealing which leaf. It publishes a nullifier `H("murmur:post", secret, round, contract)`. A second post in the same round produces the same nullifier and is rejected.
3. **Endorse.** The same membership proof, with a nullifier per report: `H("murmur:endorse", secret, reportId, contract)`. One endorsement per member per report.
4. **Follow up.** At post time the contract stores an author tag `H("murmur:author", secret, reportId, contract)`. Later only the holder of that secret can reproduce it, so only the author can add a follow-up, still without saying who they are.
5. **Respond.** The admin, authenticated by `adminKey(secret)`, sets a report to acknowledged or resolved and adds a public reply.
6. **Rounds.** The admin opens a new round, which gives every member one new post.

### Circuits

| Circuit | Who | Checks |
|---|---|---|
| `enrol(pk)` | admin | caller is the admin, key not enrolled yet, list not full (1,024) |
| `nextRound()` | admin | caller is the admin |
| `post(text)` | member | Merkle membership proof, round nullifier unused |
| `endorse(id)` | member | membership proof, report exists, report nullifier unused |
| `followUp(id, text)` | author | report exists, caller reproduces the report's author tag |
| `respond(id, status, text)` | admin | caller is the admin, report exists |

## Privacy properties

What an observer of the chain can and cannot learn:

- **No secret key is ever on the ledger.** The tests search the entire decoded public state for every participant's secret after a full run (`never writes a secret key to the public ledger`), and the demo shows the same check live.
- **A report cannot be linked to a member.** The proof shows "some leaf of this tree", not which. Nullifiers and author tags are hashes that include the secret, so they match no member key (`stores nothing that matches the author member key next to a report`).
- **Two reports by the same member cannot be linked to each other.** Their author tags and nullifiers depend on the round and the report id (`gives two reports by the same member unrelated author tags and nullifiers`).
- **Values are bound to this contract instance**, so the same member's activity on two boards cannot be correlated.

Known limits, stated plainly:

- The text of a report can identify its author ("as the only person on night shift..."). Murmur hides the sender, not the content.
- With very few members, or one active member in a round, anonymity is weak. The anonymity set is the enrolled members.
- Timing: whoever submits a transaction is visible to the network layer unless it is relayed. A production deployment would relay transactions.
- A member can endorse their own report. That costs them their one endorsement on that report and is not worth more than any other member's endorsement.

## Tests

`npm test` runs the contract in Midnight's in-memory simulator (compact-runtime, no proof server). The 13 tests cover:

- deploy and enrolment, duplicate enrolment, non-admin enrolment and non-admin round changes;
- posting, posting by a non-member, one post per round and a new post after the next round;
- endorsing once per report, endorsements by non-members and of reports that do not exist;
- follow-ups by the author only (another member and the admin are refused);
- admin responses (acknowledge, resolve, unknown report, non-admin refused);
- the three privacy properties above.

## Build and run

The Compact compiler ships for macOS and Linux. This repository compiles in CI ([`.github/workflows/compile.yml`](.github/workflows/compile.yml)) with Compact 0.36.0 through `midnightntwrk/setup-compact-action`, runs the tests, and commits the compiler output (`contract/managed/murmur`, without the proving keys) and the logs (`compile.log`, `test.log`).

```sh
npm install
npm run compile      # Compact toolchain, macOS/Linux
npm test             # simulator tests
npm run dev          # the browser demo at http://localhost:5173
```

## Roadmap

- Deploy to the Midnight Preprod network and connect the demo to the Lace wallet, so members post from their own wallets with real proofs.
- Encrypted reports that only the admin can read, for sensitive cases, alongside the public board.
- Member self-rotation: replace your key without the admin learning the old-new link.
- Several boards per organisation, with one enrolment.

## Credits

`src/test/sim.ts` is copied unchanged from [midnightntwrk/midnight-examples](https://github.com/midnightntwrk/midnight-examples) (`examples/voting`), Apache-2.0. The membership-proof pattern follows that example. Everything else in this repository was written for Murmur.

## License

[Apache-2.0](LICENSE)
