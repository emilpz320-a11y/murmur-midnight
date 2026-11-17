// SPDX-License-Identifier: Apache-2.0
//
// Off-chain witnesses for murmur.compact. Each receives a WitnessContext and
// returns [nextPrivateState, value]. The private state is only the caller's
// 32-byte secret; it never leaves the caller's machine.
import type { Ledger, Witnesses } from './managed/murmur/contract/index.js';

export type MurmurPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createMurmurPrivateState = (secretKey: Uint8Array): MurmurPrivateState => {
  if (secretKey.length !== 32) throw new Error('secretKey must be 32 bytes');
  return { secretKey };
};

export const witnesses: Witnesses<MurmurPrivateState> = {
  secretKey: ({ privateState }) => [privateState, privateState.secretKey],
  // The path is read from the members tree of the ledger state the circuit runs
  // against, so it matches the root the circuit checks.
  memberPath: ({ privateState, ledger }, pk) => {
    const path = ledger.members.findPathForLeaf(pk);
    if (path === undefined) throw new Error('This member key is not enrolled');
    return [privateState, path];
  },
};

export type { Ledger };
