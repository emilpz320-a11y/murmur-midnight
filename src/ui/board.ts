// SPDX-License-Identifier: Apache-2.0
//
// The demo's model: one deployed Murmur contract running in the compact-runtime
// simulator, and a few people, each holding only their own secret key. Every
// action calls the real compiled circuit with that person's private state.
import { Sim, collectPublicBytes } from '../test/sim.js';
import { Contract, ledger, pureCircuits, Status } from '../../contract/managed/murmur/contract/index.js';
import { createMurmurPrivateState, type MurmurPrivateState, witnesses } from '../../contract/witnesses.js';
import { type BoxKeyPair, generateBoxKeyPair, seal } from '../crypto/seal.js';
import { openReply, openReport, sealReply, sealReport } from '../crypto/envelope.js';

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
  /** True when the text is ciphertext only the admin can open. */
  sealed: boolean;
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
  /** The admin's encryption key pair: lives on the admin's device only. */
  private boxKeys?: BoxKeyPair;
  /** Sealed reports and follow-ups as decrypted on the admin's device. */
  private inbox = new Map<string, string>();
  /** Reply keys the admin learned from sealed envelopes, by report id (admin's device). */
  private replyKeyFor = new Map<bigint, Uint8Array>();
  /** Each author's one-off reply keys, by report id (each author's own device). */
  private myReplyKeys = new Map<PersonId, Map<bigint, BoxKeyPair>>();

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
      await this.refreshInbox();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.unshift({ ok: false, who, action, detail: `refused: ${explain(msg)}` });
      return false;
    }
  }

  /** The admin publishes (or rotates) the public half of an encryption key; the private half stays here. */
  async publishBoxKey(by: PersonId = 'admin') {
    const keys = await generateBoxKeyPair();
    const ok = await this.run(by, 'publish encryption key', () => this.sim.call('setBoxKey', keys.publicKey), () => `X25519 key ${short(keys.publicKey)} published; the private half stays on the admin's device`);
    if (ok && by === 'admin') {
      this.boxKeys = keys;
      await this.refreshInbox();
    }
    return ok;
  }

  get hasBoxKey(): boolean {
    return this.sim.ledger().adminBoxKey.some((b) => b !== 0);
  }

  /** Encrypts on the member's device to the published admin key, then posts only the ciphertext. */
  async postSealed(p: PersonId, text: string) {
    let box = 'msv1:';
    let replyKeys: BoxKeyPair | undefined;
    try {
      ({ sealed: box, replyKeys } = await sealReport(text, this.sim.ledger().adminBoxKey));
    } catch {
      // No key published: the contract refuses the empty box below.
    }
    let id = -1n;
    const ok = await this.run(p, 'post sealed', async () => {
      const r = await this.sim.call('postSealed', box);
      id = r.result;
      return r;
    }, (r) => `report #${r.result} published anonymously, sealed for the admin, with a private reply key kept on this device`);
    if (ok && replyKeys) {
      if (!this.myReplyKeys.has(p)) this.myReplyKeys.set(p, new Map());
      this.myReplyKeys.get(p)!.set(id, replyKeys);
    }
    return ok;
  }

  /** Decrypt what the admin's key can open. Runs only with the admin's private key, on the admin's device. */
  private async refreshInbox() {
    if (!this.boxKeys) return;
    const l = this.sim.ledger();
    for (let i = 0n; i < l.reportCount; i++) {
      if (!l.sealedReports.member(i)) continue;
      const texts: [string, string][] = [[`r${i}`, l.reports.lookup(i)], [`f${i}`, l.followUps.member(i) ? l.followUps.lookup(i) : '']];
      for (const [k, s] of texts) {
        if (!s || this.inbox.has(k + s)) continue;
        try {
          const o = await openReport(s, this.boxKeys);
          this.inbox.set(k + s, o.text);
          if (k.startsWith('r') && o.replyKey) this.replyKeyFor.set(i, o.replyKey);
        } catch {
          this.inbox.set(k + s, '(sealed with an earlier key)');
        }
      }
    }
  }

  /** True when the admin can answer this sealed report privately (its author left a reply key). */
  canReplyPrivately(id: bigint): boolean {
    return this.replyKeyFor.has(id);
  }

  /** The author's device opens a private reply; anyone else gets undefined. */
  async readPrivateReply(viewer: PersonId, id: bigint, sealedReply: string): Promise<string | undefined> {
    const keys = this.myReplyKeys.get(viewer)?.get(id);
    if (!keys) return undefined;
    try {
      return await openReply(sealedReply, keys);
    } catch {
      return undefined;
    }
  }

  /** What the admin's device shows for a sealed text, or undefined for anyone else. */
  decrypted(viewer: PersonId, kind: 'r' | 'f', id: bigint, sealedText: string): string | undefined {
    return viewer === 'admin' ? this.inbox.get(`${kind}${id}${sealedText}`) : undefined;
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

  async followUp(p: PersonId, id: bigint, text: string) {
    // Follow-ups on a sealed report are sealed too.
    if (this.sim.ledger().sealedReports.member(id) && this.hasBoxKey) text = await seal(text, this.sim.ledger().adminBoxKey);
    return this.run(p, `follow up #${id}`, () => this.sim.call('followUp', id, text), () => `author note added to #${id}`);
  }

  async respond(id: bigint, status: Status, text: string, by: PersonId = 'admin') {
    // A sealed report that carries a reply key gets a reply only its anonymous author can read.
    const key = by === 'admin' ? this.replyKeyFor.get(id) : undefined;
    if (key) text = await sealReply(text, key);
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
        sealed: l.sealedReports.member(i),
      });
    }
    return out.reverse();
  }

  /** What anyone reading the chain sees. */
  publicView() {
    const l = this.sim.ledger();
    return {
      adminPk: short(l.adminPk),
      adminBoxKey: l.adminBoxKey.some((b) => b !== 0) ? short(l.adminBoxKey) : null,
      sealedCount: [...l.sealedReports].length,
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
    'The admin has not published an encryption key',
  ];
  return known.find((k) => message.includes(k)) ?? message.slice(0, 160);
}
