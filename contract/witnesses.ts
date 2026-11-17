// SPDX-License-Identifier: Apache-2.0
//
// Off-chain witnesses for murmur.compact. Each receives a WitnessContext and
// returns [nextPrivateState, value]. The private state (the caller's 32-byte
// secret and the ids of the reports they wrote and endorsed) never leaves the
// caller's machine.
import type { Ledger, Witnesses } from './managed/murmur/contract/index.js';

export type MurmurPrivateState = {
  readonly secretKey: Uint8Array;
  /** Ids of the reports this member wrote. Known only to them. */
  readonly authored: readonly bigint[];
  /** Ids of the reports this member endorsed. Known only to them. */
  readonly endorsed: readonly bigint[];
};

export const createMurmurPrivateState = (
  secretKey: Uint8Array,
  authored: readonly bigint[] = [],
  endorsed: readonly bigint[] = [],
): MurmurPrivateState => {
  if (secretKey.length !== 32) throw new Error('secretKey must be 32 bytes');
  return { secretKey, authored, endorsed };
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
  // Called at the end of post/endorse, after every check passed. A failed
  // circuit never returns its new private state, so nothing is recorded then.
  rememberAuthored: ({ privateState }, id) => [{ ...privateState, authored: [...privateState.authored, id] }, []],
  rememberEndorsed: ({ privateState }, id) => [{ ...privateState, endorsed: [...privateState.endorsed, id] }, []],
};

export type { Ledger };
