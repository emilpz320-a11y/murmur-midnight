// SPDX-License-Identifier: Apache-2.0
//
// Off-chain witnesses for murmur.compact. Each receives a WitnessContext and
// returns [nextPrivateState, value]. The private state (the caller's 32-byte
// secret, where that key came from, the keys they rotated away from, and the
// ids of the reports they wrote and endorsed) never leaves the caller's machine.
import type { Ledger, Witnesses } from './managed/murmur/contract/index.js';

/** How the current key was created: enrolled by the admin, or by a rotation. */
export type KeyOrigin = {
  readonly rotated: boolean;
  /** Round and report count when the rotation happened (0 for enrolled keys). */
  readonly sinceRound: bigint;
  readonly sinceReport: bigint;
};

/** A key this member rotated away from, with the reports it wrote. */
export type PastKey = {
  readonly secretKey: Uint8Array;
  readonly authored: readonly bigint[];
};

export type MurmurPrivateState = {
  readonly secretKey: Uint8Array;
  /** Ids of the reports this member wrote. Known only to them. */
  readonly authored: readonly bigint[];
  /** Ids of the reports this member endorsed. Known only to them. */
  readonly endorsed: readonly bigint[];
  readonly origin: KeyOrigin;
  /** Retired keys, kept so the member can still follow up on older reports. */
  readonly pastKeys: readonly PastKey[];
};

export const ENROLLED: KeyOrigin = { rotated: false, sinceRound: 0n, sinceReport: 0n };

export const createMurmurPrivateState = (
  secretKey: Uint8Array,
  authored: readonly bigint[] = [],
  endorsed: readonly bigint[] = [],
): MurmurPrivateState => {
  if (secretKey.length !== 32) throw new Error('secretKey must be 32 bytes');
  return { secretKey, authored, endorsed, origin: ENROLLED, pastKeys: [] };
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
  keyOrigin: ({ privateState }) => [privateState, { ...privateState.origin }],
  authorSecret: ({ privateState }, id) => {
    const past = privateState.pastKeys.find((k) => k.authored.includes(id));
    return [privateState, past ? past.secretKey : privateState.secretKey];
  },
  freshSecretKey: ({ privateState }) => [privateState, crypto.getRandomValues(new Uint8Array(32))],
  // Called last in rotateKey, after every check passed: the old secret moves to
  // pastKeys (with the reports it wrote) and the new one becomes current.
  adoptKey: ({ privateState }, sk, sinceRound, sinceReport) => {
    const earlier = new Set(privateState.pastKeys.flatMap((k) => k.authored));
    const retired: PastKey = {
      secretKey: privateState.secretKey,
      authored: privateState.authored.filter((id) => !earlier.has(id)),
    };
    return [
      {
        ...privateState,
        secretKey: sk,
        origin: { rotated: true, sinceRound, sinceReport },
        pastKeys: [...privateState.pastKeys, retired],
      },
      [],
    ];
  },
};

export type { Ledger };
