// SPDX-License-Identifier: Apache-2.0
//
// Private two-way channel on top of sealed reports.
//
// When a member seals a report, their device also creates a one-off "reply key"
// pair and puts the public half inside the sealed envelope, next to the text.
// Only the admin can open the envelope, so only the admin learns the reply key.
// The admin's answer is then sealed to that key and stored with `respond`: the
// ledger holds ciphertext that only the anonymous author can read. The admin
// never learns who the author is, observers learn neither the question nor the
// answer, and the reply key is used for exactly one report, so it links nothing.
import { type BoxKeyPair, generateBoxKeyPair, open, seal } from './seal.js';

type Envelope = { v: 1; text: string; reply: string };

const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Seal a report for the admin, with a fresh reply key whose private half stays with the author. */
export async function sealReport(text: string, adminPublicKey: Uint8Array): Promise<{ sealed: string; replyKeys: BoxKeyPair }> {
  const replyKeys = await generateBoxKeyPair();
  const envelope: Envelope = { v: 1, text, reply: toB64(replyKeys.publicKey) };
  return { sealed: await seal(JSON.stringify(envelope), adminPublicKey), replyKeys };
}

/** Admin side: open a sealed report. `replyKey` is present when the author asked for private replies. */
export async function openReport(sealed: string, adminKeys: BoxKeyPair): Promise<{ text: string; replyKey?: Uint8Array }> {
  const plain = await open(sealed, adminKeys);
  try {
    const e = JSON.parse(plain) as Partial<Envelope>;
    if (e && e.v === 1 && typeof e.text === 'string' && typeof e.reply === 'string') {
      const replyKey = fromB64(e.reply);
      if (replyKey.length === 32) return { text: e.text, replyKey };
      return { text: e.text };
    }
  } catch {
    // Not an envelope: a plain sealed text (for example a sealed follow-up).
  }
  return { text: plain };
}

/** Admin side: seal the answer so that only the report's anonymous author can read it. */
export const sealReply = (text: string, replyKey: Uint8Array): Promise<string> => seal(text, replyKey);

/** Author side: read the admin's private answer. */
export const openReply = (sealed: string, replyKeys: BoxKeyPair): Promise<string> => open(sealed, replyKeys);
