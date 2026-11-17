// SPDX-License-Identifier: Apache-2.0
//
// The demo's model: one deployed Murmur contract running in the compact-runtime
// simulator, and a few people, each holding only their own secret key. Every
// action calls the real compiled circuit with that person's private state.
import { Sim, collectPublicBytes } from '../test/sim.js';
import { Contract, ledger, pureCircuits, Status } from '../../contract/managed/murmur/contract/index.js';
import { createMurmurPrivateState, type MurmurPrivateState, witnesses } from '../../contract/witnesses.js';

export { Status };

export type PersonId = 'admin' | 'ana' | 'ben' | 'cleo' | 'outsider';

export interface Person {
  id: PersonId;
  name: string;
  role: string;
  secretKey: Uint8Array;
  /** This person's private state: lives on their device only. */
  privateState: MurmurPrivateState;
}

export interface Report {
  id: bigint;
  text: string;
  round: bigint;
  status: Status;
  endorsements: bigint;
  followUp?: string;
  reply?: string;
  authorTag: string;
}

export interface LogEntry {
  ok: boolean;
  who: string;
  action: string;
  detail: string;
}

const newKey = () => crypto.getRandomValues(new Uint8Array(32));
export const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
export const short = (u: Uint8Array) => `${hex(u).slice(0, 10)}…`;

type MurmurSim = Awaited<ReturnType<typeof deployWith>>;
const deployWith = (adminSecret: Uint8Array) =>
  Sim.deploy({ contract: new Contract(witnesses), ledger, privateState: createMurmurPrivateState(adminSecret) });

export class Board {
  readonly people: Record<PersonId, Person>;
  readonly log: LogEntry[] = [];
  private sim!: MurmurSim;

  private constructor() {
    const person = (id: PersonId, name: string, role: string): Person => {
      const secretKey = newKey();
      return { id, name, role, secretKey, privateState: createMurmurPrivateState(secretKey) };
    };
    this.people = {
      admin: person('admin', 'Morgan', 'admin'),
      ana: person('ana', 'Ana', 'member'),
      ben: person('ben', 'Ben', 'member'),
      cleo: person('cleo', 'Cleo', 'member'),
      outsider: person('outsider', 'Dex', 'not enrolled'),
    };
  }

  static async create(): Promise<Board> {
    const board = new Board();
    board.sim = await deployWith(board.people.admin.secretKey);
    board.log.unshift({ ok: true, who: 'Morgan', action: 'deploy', detail: 'board deployed; admin key published' });
    return board;
  }

  memberKey(p: PersonId): Uint8Array {
    return pureCircuits.memberKey(this.people[p].secretKey);
  }

  isEnrolled(p: PersonId): boolean {
    return this.sim.ledger().memberKeys.member(this.memberKey(p));
  }

  private async run<T>(p: PersonId, action: string, fn: () => Promise<T>, detail: (r: T) => string): Promise<boolean> {
    const who = this.people[p].name;
    this.sim.privateState = this.people[p].privateState;
    try {
      const r = await fn();
      this.people[p].privateState = this.sim.privateState;
      this.log.unshift({ ok: true, who, action, detail: detail(r) });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.unshift({ ok: false, who, action, detail: `refused: ${explain(msg)}` });
      return false;
    }
  }

  enrol(p: PersonId, by: PersonId = 'admin') {
    const key = this.memberKey(p);
    return this.run(by, `enrol ${this.people[p].name}`, () => this.sim.call('enrol', key), () => `member key ${short(key)} added to the tree`);
  }

  nextRound(by: PersonId = 'admin') {
    return this.run(by, 'next round', () => this.sim.call('nextRound'), (r) => `round is now ${r.ledger.round}`);
  }

  post(p: PersonId, text: string) {
    return this.run(p, 'post', () => this.sim.call('post', text), (r) => `report #${r.result} published anonymously`);
  }

  endorse(p: PersonId, id: bigint) {
    return this.run(p, `endorse #${id}`, () => this.sim.call('endorse', id), (r) => `report #${id} now has ${r.ledger.endorsements.lookup(id)} endorsement(s)`);
  }

  followUp(p: PersonId, id: bigint, text: string) {
    return this.run(p, `follow up #${id}`, () => this.sim.call('followUp', id, text), () => `author note added to #${id}`);
  }

  respond(id: bigint, status: Status, text: string, by: PersonId = 'admin') {
    return this.run(by, `respond #${id}`, () => this.sim.call('respond', id, status, text), () => `#${id} marked ${Status[status].toLowerCase()}`);
  }

  /** What only this person's device knows: the reports they wrote and endorsed. */
  privateView(p: PersonId): { authored: readonly bigint[]; endorsed: readonly bigint[] } {
    const { authored, endorsed } = this.people[p].privateState;
    return { authored, endorsed };
  }

  get round(): bigint {
    return this.sim.ledger().round;
  }

  reports(): Report[] {
    const l = this.sim.ledger();
    const out: Report[] = [];
    for (let i = 0n; i < l.reportCount; i++) {
      out.push({
        id: i,
        text: l.reports.lookup(i),
        round: l.reportRound.lookup(i),
        status: l.statuses.lookup(i),
        endorsements: l.endorsements.lookup(i),
        followUp: l.followUps.member(i) ? l.followUps.lookup(i) : undefined,
        reply: l.replies.member(i) ? l.replies.lookup(i) : undefined,
        authorTag: short(l.authorTags.lookup(i)),
      });
    }
    return out.reverse();
  }

  /** What anyone reading the chain sees. */
  publicView() {
    const l = this.sim.ledger();
    return {
      adminPk: short(l.adminPk),
      memberKeys: [...l.memberKeys].map(short),
      nullifiers: [...l.nullifiers].map(short),
      round: l.round,
      reportCount: l.reportCount,
    };
  }

  /** Searches the whole public ledger for each person's secret key. */
  privacyCheck(): { name: string; found: string | null }[] {
    const fields = collectPublicBytes(this.sim.ledger());
    return Object.values(this.people).map((p) => {
      const secret = hex(p.secretKey);
      const hit = fields.find((f) => hex(f.bytes).includes(secret));
      return { name: p.name, found: hit ? hit.label : null };
    });
  }
}

function explain(message: string): string {
  const known = [
    'Only the admin can do this',
    'Member already enrolled',
    'Already posted this round',
    'Already endorsed this report',
    'Only the author can follow up',
    'No such report',
    'This member key is not enrolled',
  ];
  return known.find((k) => message.includes(k)) ?? message.slice(0, 160);
}
