// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { Sim, assertNotInPublicState, expectRejects } from './sim.js';
import { Contract, ledger, pureCircuits, Status } from '../../contract/managed/murmur/contract/index.js';
import { createMurmurPrivateState, type MurmurPrivateState, witnesses } from '../../contract/witnesses.js';

const newSecretKey = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));
const memberKey = (sk: Uint8Array) => pureCircuits.memberKey(sk);
const adminKey = (sk: Uint8Array) => pureCircuits.adminKey(sk);
const hex = (u: Uint8Array) => Buffer.from(u).toString('hex');

const ADMIN_SK = newSecretKey();

const deploy = () =>
  Sim.deploy({
    contract: new Contract(witnesses),
    ledger,
    privateState: createMurmurPrivateState(ADMIN_SK),
  });

type MurmurSim = Awaited<ReturnType<typeof deploy>>;

// Each person's private state lives on their own device: keep one per secret
// key across calls, as a wallet's private state provider would.
const wallets = new Map<string, MurmurPrivateState>();
const walletOf = (sk: Uint8Array) => wallets.get(hex(sk)) ?? createMurmurPrivateState(sk);

const as = (sim: MurmurSim, sk: Uint8Array) => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call: async (circuit: string, ...args: any[]) => {
    sim.privateState = walletOf(sk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (sim.call as any)(circuit, ...args);
    wallets.set(hex(sk), sim.privateState);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return out as { result: any; ledger: ReturnType<MurmurSim['ledger']> };
  },
});

/** A deployed board with `n` enrolled members. */
const setup = async (n = 3) => {
  const sim = await deploy();
  const members = Array.from({ length: n }, () => newSecretKey());
  for (const sk of members) await as(sim, ADMIN_SK).call('enrol', memberKey(sk));
  return { sim, members };
};

describe('Murmur: setup and enrolment', () => {
  it('deploys with the admin key and an empty board', async () => {
    const l = (await deploy()).ledger();
    expect(l.adminPk).toEqual(adminKey(ADMIN_SK));
    expect(l.memberCount).toBe(0n);
    expect(l.reportCount).toBe(0n);
    expect(l.round).toBe(0n);
  });

  it('lets the admin enrol members and refuses duplicates', async () => {
    const { sim, members } = await setup(2);
    const l = sim.ledger();
    expect(l.memberCount).toBe(2n);
    expect(l.memberKeys.member(memberKey(members[0]))).toBe(true);
    await expectRejects(() => as(sim, ADMIN_SK).call('enrol', memberKey(members[0])), 'Member already enrolled');
  });

  it('refuses enrolment and new rounds from anyone but the admin', async () => {
    const { sim, members } = await setup(1);
    await expectRejects(() => as(sim, members[0]).call('enrol', memberKey(newSecretKey())), 'Only the admin');
    await expectRejects(() => as(sim, members[0]).call('nextRound'), 'Only the admin');
  });
});

describe('Murmur: posting', () => {
  it('lets a member post a report, opened in the current round', async () => {
    const { sim, members } = await setup();
    const { result, ledger: l } = await as(sim, members[1]).call('post', 'The release checklist skips the security review.');
    expect(result).toBe(0n);
    expect(l.reportCount).toBe(1n);
    expect(l.reports.lookup(0n)).toBe('The release checklist skips the security review.');
    expect(l.statuses.lookup(0n)).toBe(Status.OPEN);
    expect(l.reportRound.lookup(0n)).toBe(0n);
    expect(l.endorsements.lookup(0n)).toBe(0n);
  });

  it('refuses a post from someone who is not enrolled', async () => {
    const { sim } = await setup();
    await expectRejects(() => as(sim, newSecretKey()).call('post', 'spam'), 'not enrolled');
  });

  it('allows one post per member per round, and a new one after the admin opens the next round', async () => {
    const { sim, members } = await setup();
    await as(sim, members[0]).call('post', 'first');
    await expectRejects(() => as(sim, members[0]).call('post', 'second'), 'Already posted this round');
    await as(sim, members[1]).call('post', 'another member is fine');
    await as(sim, ADMIN_SK).call('nextRound');
    const { result, ledger: l } = await as(sim, members[0]).call('post', 'next round');
    expect(result).toBe(2n);
    expect(l.reportRound.lookup(2n)).toBe(1n);
  });
});

describe('Murmur: endorsing', () => {
  it('counts one endorsement per member per report', async () => {
    const { sim, members } = await setup(3);
    await as(sim, members[0]).call('post', 'report');
    await as(sim, members[1]).call('endorse', 0n);
    await expectRejects(() => as(sim, members[1]).call('endorse', 0n), 'Already endorsed this report');
    const { ledger: l } = await as(sim, members[2]).call('endorse', 0n);
    expect(l.endorsements.lookup(0n)).toBe(2n);
  });

  it('refuses endorsements from non-members and of reports that do not exist', async () => {
    const { sim, members } = await setup(2);
    await as(sim, members[0]).call('post', 'report');
    await expectRejects(() => as(sim, newSecretKey()).call('endorse', 0n), 'not enrolled');
    await expectRejects(() => as(sim, members[1]).call('endorse', 7n), 'No such report');
  });
});

describe('Murmur: follow-ups and replies', () => {
  it('lets only the author follow up on a report', async () => {
    const { sim, members } = await setup(2);
    await as(sim, members[0]).call('post', 'report');
    await expectRejects(() => as(sim, members[1]).call('followUp', 0n, 'not mine'), 'Only the author');
    await expectRejects(() => as(sim, ADMIN_SK).call('followUp', 0n, 'admin either'), 'Only the author');
    const { ledger: l } = await as(sim, members[0]).call('followUp', 0n, 'More detail: it happened twice.');
    expect(l.followUps.lookup(0n)).toBe('More detail: it happened twice.');
  });

  it('lets the admin acknowledge and resolve, and nobody else', async () => {
    const { sim, members } = await setup(1);
    await as(sim, members[0]).call('post', 'report');
    await expectRejects(() => as(sim, members[0]).call('respond', 0n, Status.RESOLVED, 'self-resolved'), 'Only the admin');
    await as(sim, ADMIN_SK).call('respond', 0n, Status.ACKNOWLEDGED, 'Looking into it.');
    let l = sim.ledger();
    expect(l.statuses.lookup(0n)).toBe(Status.ACKNOWLEDGED);
    expect(l.replies.lookup(0n)).toBe('Looking into it.');
    await as(sim, ADMIN_SK).call('respond', 0n, Status.RESOLVED, 'Fixed in the checklist.');
    l = sim.ledger();
    expect(l.statuses.lookup(0n)).toBe(Status.RESOLVED);
    await expectRejects(() => as(sim, ADMIN_SK).call('respond', 9n, Status.RESOLVED, 'x'), 'No such report');
  });
});

describe('Murmur: private state', () => {
  it('records a post only in the author's private state', async () => {
    const { sim, members } = await setup(2);
    await as(sim, members[0]).call('post', 'mine');
    expect(walletOf(members[0]).authored).toEqual([0n]);
    expect(walletOf(members[1]).authored).toEqual([]);
    expect(walletOf(ADMIN_SK).authored).toEqual([]);
  });

  it('keeps a refused post out of the private state', async () => {
    const { sim, members } = await setup(1);
    await as(sim, members[0]).call('post', 'first');
    await expectRejects(() => as(sim, members[0]).call('post', 'second'), 'Already posted this round');
    expect(walletOf(members[0]).authored).toEqual([0n]);
  });

  it('records endorsements privately, once, and nothing for a refused endorsement', async () => {
    const { sim, members } = await setup(3);
    await as(sim, members[0]).call('post', 'a');
    await as(sim, ADMIN_SK).call('nextRound');
    await as(sim, members[0]).call('post', 'b');
    await as(sim, members[1]).call('endorse', 1n);
    await as(sim, members[1]).call('endorse', 0n);
    await expectRejects(() => as(sim, members[1]).call('endorse', 0n), 'Already endorsed this report');
    expect(walletOf(members[1]).endorsed).toEqual([1n, 0n]);
    expect(walletOf(members[2]).endorsed).toEqual([]);
    expect(walletOf(members[0]).authored).toEqual([0n, 1n]);
  });

  it('lets the author find their own reports from private state alone, and follow up on them', async () => {
    const { sim, members } = await setup(3);
    await as(sim, members[1]).call('post', 'not mine');
    await as(sim, members[2]).call('post', 'mine');
    const [mine] = walletOf(members[2]).authored;
    expect(sim.ledger().reports.lookup(mine)).toBe('mine');
    const { ledger: l } = await as(sim, members[2]).call('followUp', mine, 'still happening');
    expect(l.followUps.lookup(mine)).toBe('still happening');
  });
});

describe('Murmur: privacy', () => {
  it('never writes a secret key to the public ledger', async () => {
    const { sim, members } = await setup(3);
    await as(sim, members[0]).call('post', 'a');
    await as(sim, members[1]).call('endorse', 0n);
    await as(sim, members[0]).call('followUp', 0n, 'b');
    await as(sim, ADMIN_SK).call('respond', 0n, Status.ACKNOWLEDGED, 'c');
    assertNotInPublicState(sim.ledger(), {
      admin: ADMIN_SK,
      member0: members[0],
      member1: members[1],
      member2: members[2],
    });
  });

  it('stores nothing that matches the author member key next to a report', async () => {
    const { sim, members } = await setup(3);
    await as(sim, members[2]).call('post', 'who wrote this?');
    const l = sim.ledger();
    const tag = hex(l.authorTags.lookup(0n));
    for (const sk of members) expect(tag).not.toBe(hex(memberKey(sk)));
    for (const n of l.nullifiers) {
      for (const sk of members) expect(hex(n)).not.toBe(hex(memberKey(sk)));
    }
  });

  it('gives two reports by the same member unrelated author tags and nullifiers', async () => {
    const { sim, members } = await setup(2);
    await as(sim, members[0]).call('post', 'round 0');
    const n0 = [...sim.ledger().nullifiers].map(hex);
    await as(sim, ADMIN_SK).call('nextRound');
    await as(sim, members[0]).call('post', 'round 1');
    const l = sim.ledger();
    expect(hex(l.authorTags.lookup(0n))).not.toBe(hex(l.authorTags.lookup(1n)));
    const n1 = [...l.nullifiers].map(hex).filter((x) => !n0.includes(x));
    expect(n1).toHaveLength(1);
    expect(n0).not.toContain(n1[0]);
  });
});
