import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Status { OPEN = 0, ACKNOWLEDGED = 1, RESOLVED = 2 }

export type Witnesses<PS> = {
  secretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  memberPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
             pk_0: Uint8Array): [PS, { leaf: Uint8Array,
                                       path: { sibling: { field: bigint },
                                               goes_left: boolean
                                             }[]
                                     }];
  rememberAuthored(context: __compactRuntime.WitnessContext<Ledger, PS>,
                   id_0: bigint): [PS, []];
  rememberEndorsed(context: __compactRuntime.WitnessContext<Ledger, PS>,
                   id_0: bigint): [PS, []];
}

export type ImpureCircuits<PS> = {
  enrol(context: __compactRuntime.CircuitContext<PS>, pk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  nextRound(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  post(context: __compactRuntime.CircuitContext<PS>, text_0: string): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  endorse(context: __compactRuntime.CircuitContext<PS>, id_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  followUp(context: __compactRuntime.CircuitContext<PS>,
           id_0: bigint,
           text_0: string): Promise<__compactRuntime.CircuitResults<PS, []>>;
  respond(context: __compactRuntime.CircuitContext<PS>,
          id_0: bigint,
          status_0: Status,
          text_0: string): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type ProvableCircuits<PS> = {
  enrol(context: __compactRuntime.CircuitContext<PS>, pk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  nextRound(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  post(context: __compactRuntime.CircuitContext<PS>, text_0: string): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  endorse(context: __compactRuntime.CircuitContext<PS>, id_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  followUp(context: __compactRuntime.CircuitContext<PS>,
           id_0: bigint,
           text_0: string): Promise<__compactRuntime.CircuitResults<PS, []>>;
  respond(context: __compactRuntime.CircuitContext<PS>,
          id_0: bigint,
          status_0: Status,
          text_0: string): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type PureCircuits = {
  adminKey(sk_0: Uint8Array): Uint8Array;
  memberKey(sk_0: Uint8Array): Uint8Array;
  postNullifier(sk_0: Uint8Array, rnd_0: Uint8Array, instance_0: Uint8Array): Uint8Array;
  endorseNullifier(sk_0: Uint8Array, id_0: Uint8Array, instance_0: Uint8Array): Uint8Array;
  authorTag(sk_0: Uint8Array, id_0: Uint8Array, instance_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  adminKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  memberKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  postNullifier(context: __compactRuntime.CircuitContext<PS>,
                sk_0: Uint8Array,
                rnd_0: Uint8Array,
                instance_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  endorseNullifier(context: __compactRuntime.CircuitContext<PS>,
                   sk_0: Uint8Array,
                   id_0: Uint8Array,
                   instance_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  authorTag(context: __compactRuntime.CircuitContext<PS>,
            sk_0: Uint8Array,
            id_0: Uint8Array,
            instance_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  enrol(context: __compactRuntime.CircuitContext<PS>, pk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  nextRound(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  post(context: __compactRuntime.CircuitContext<PS>, text_0: string): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  endorse(context: __compactRuntime.CircuitContext<PS>, id_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  followUp(context: __compactRuntime.CircuitContext<PS>,
           id_0: bigint,
           text_0: string): Promise<__compactRuntime.CircuitResults<PS, []>>;
  respond(context: __compactRuntime.CircuitContext<PS>,
          id_0: bigint,
          status_0: Status,
          text_0: string): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type Ledger = {
  readonly adminPk: Uint8Array;
  members: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  memberKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly memberCount: bigint;
  readonly round: bigint;
  readonly reportCount: bigint;
  reports: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): string;
    [Symbol.iterator](): Iterator<[bigint, string]>
  };
  reportRound: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
  authorTags: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Uint8Array;
    [Symbol.iterator](): Iterator<[bigint, Uint8Array]>
  };
  statuses: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Status;
    [Symbol.iterator](): Iterator<[bigint, Status]>
  };
  endorsements: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
  followUps: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): string;
    [Symbol.iterator](): Iterator<[bigint, string]>
  };
  replies: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): string;
    [Symbol.iterator](): Iterator<[bigint, string]>
  };
  nullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
}

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
export declare const circuitSignatures: __compactRuntime.CircuitSignatures;
export declare const declaredInterfaces: __compactRuntime.DeclaredInterfaces;
