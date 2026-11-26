// SPDX-License-Identifier: Apache-2.0
import { Board, Status, type PersonId } from './board.js';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const STATUS = ['open', 'acknowledged', 'resolved'];

let board: Board;
let me: PersonId = 'ana';
let busy = false;

async function act(fn: () => Promise<unknown>) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
  try {
    await fn();
  } finally {
    busy = false;
    render();
  }
}

function renderPeople() {
  $('people').innerHTML = Object.values(board.people)
    .map((p) => {
      const enrolled = p.id === 'admin' ? 'admin' : board.isEnrolled(p.id) ? 'member' : 'not enrolled';
      return `<button class="person${p.id === me ? ' active' : ''}" data-person="${p.id}">${esc(p.name)}<small>${enrolled}</small></button>`;
    })
    .join('');
}

function renderCompose() {
  const p = board.people[me];
  $('compose').innerHTML = `
    <h2>Post as ${esc(p.name)} · round ${board.round}</h2>
    <textarea id="text" maxlength="400" placeholder="What should the team know? Members post anonymously; one post per member per round."></textarea>
    <div class="row"><button class="act primary" data-do="post">Post anonymously</button>
    <label class="muted"><input type="checkbox" id="sealed" ${board.hasBoxKey ? '' : 'disabled'}> Confidential: seal it so only the admin can read it${board.hasBoxKey ? '' : ' (the admin has not published an encryption key yet)'}</label></div>
    <p class="muted">Your secret proves membership in zero knowledge; the board never learns which member you are. A sealed report is encrypted on this device before it is posted.</p>
    <div class="private"><b>Only on ${esc(p.name)}'s device</b> (private state, never on chain):
      ${privateLine(me)}</div>`;
}

function privateLine(p: PersonId): string {
  const v = board.privateView(p);
  const list = (ids: readonly bigint[]) => (ids.length ? ids.map((i) => `#${i}`).join(', ') : 'none');
  return `wrote ${list(v.authored)} · endorsed ${list(v.endorsed)}`;
}

function renderReports() {
  const mine = board.privateView(me);
  const reports = board.reports();
  if (reports.length === 0) {
    $('reports').innerHTML = '<p class="empty">No reports yet. Enrol members, then post as one of them.</p>';
    return;
  }
  $('reports').innerHTML = reports
    .map(
      (r) => `
      <article class="report">
        <div class="meta"><b>#${r.id}</b><span class="badge s${r.status}">${STATUS[r.status]}</span>
          ${mine.authored.includes(r.id) ? '<span class="badge mine">yours (only you can see this)</span>' : ''}
          <span>round ${r.round}</span><span>${r.endorsements} endorsement(s)</span>
          <span class="mono" title="author tag: only the author can reproduce it">tag ${r.authorTag}</span>
          ${r.sealed ? '<span class="badge sealed">sealed for the admin</span>' : ''}</div>
        ${sealedOr(r.sealed, 'r', r.id, r.text, (s) => `<p class="text">${esc(s)}</p>`)}
        ${r.followUp ? sealedOr(r.sealed, 'f', r.id, r.followUp, (s) => `<div class="note"><b>Author follow-up:</b> ${esc(s)}</div>`) : ''}
        ${r.reply ? `<div class="note"><b>Admin:</b> ${esc(r.reply)}</div>` : ''}
        <div class="row">
          <button class="act" data-do="endorse" data-id="${r.id}">${mine.endorsed.includes(r.id) ? 'Endorsed by you' : `Endorse as ${esc(board.people[me].name)}`}</button>
          <input id="fu-${r.id}" placeholder="Follow-up (author only)" style="max-width:260px">
          <button class="act" data-do="followUp" data-id="${r.id}">Add follow-up</button>
        </div>
      </article>`,
    )
    .join('');
}

// A sealed text shows as ciphertext to everyone except the admin's device, which decrypts it locally.
function sealedOr(sealed: boolean, kind: 'r' | 'f', id: bigint, text: string, show: (s: string) => string): string {
  if (!sealed || !text.startsWith('msv1:')) return show(text);
  const plain = board.decrypted(me, kind, id, text);
  if (plain !== undefined) return show(plain) + '<p class="muted">Decrypted on the admin&#39;s device; the chain holds only ciphertext.</p>';
  return `<p class="text sealed-text">🔒 Sealed. Only the admin can read it. On chain: <code>${esc(text.slice(0, 42))}…</code></p>`;
}

function renderAdmin() {
  const isAdmin = me === 'admin';
  const reports = board.reports();
  const enrolBtns = (['ana', 'ben', 'cleo', 'outsider'] as PersonId[])
    .filter((p) => !board.isEnrolled(p))
    .map((p) => `<button class="act" data-do="enrol" data-who="${p}">Enrol ${esc(board.people[p].name)}</button>`)
    .join('');
  $('admin').innerHTML = `
    <h2>Admin actions ${isAdmin ? '' : `<span class="muted">(you are ${esc(board.people[me].name)}: the contract will refuse)</span>`}</h2>
    <div class="row">${enrolBtns || '<span class="muted">Everyone is enrolled.</span>'}</div>
    <div class="row"><button class="act" data-do="nextRound">Open next round</button>
      <button class="act" data-do="publishKey">${board.hasBoxKey ? 'Rotate encryption key' : 'Publish encryption key'}</button></div>
    ${
      reports.length
        ? `<div class="row"><select id="r-id" style="max-width:90px">${reports.map((r) => `<option value="${r.id}">#${r.id}</option>`).join('')}</select>
           <select id="r-status" style="max-width:150px"><option value="1">acknowledged</option><option value="2">resolved</option></select></div>
           <div class="row"><input id="r-text" placeholder="Public reply"><button class="act" data-do="respond">Respond</button></div>`
        : ''
    }`;
}

function renderPublic() {
  const v = board.publicView();
  const check = board.privacyCheck();
  $('public').innerHTML = `
    <p class="muted">Admin key <code>${v.adminPk}</code> · round ${v.round} · ${v.reportCount} report(s), ${v.sealedCount} sealed</p>
    <p class="muted">Admin encryption key (X25519, public half): ${v.adminBoxKey ? `<code>${v.adminBoxKey}</code>` : 'not published'}</p>
    <p class="muted">Member keys (published at enrolment):</p>
    <ul class="plain mono">${v.memberKeys.map((k) => `<li>${k}</li>`).join('') || '<li class="empty">none</li>'}</ul>
    <p class="muted">Spent nullifiers (posts and endorsements; none matches a member key):</p>
    <ul class="plain mono">${v.nullifiers.map((k) => `<li>${k}</li>`).join('') || '<li class="empty">none</li>'}</ul>
    <p class="muted">Search the whole public ledger for each person's secret key:</p>
    <ul class="plain">${check
      .map((c) => `<li>${esc(c.name)}: ${c.found ? `<span class="bad">found at ${esc(c.found)}</span>` : '<span class="ok">not found</span>'}</li>`)
      .join('')}</ul>`;
}

function renderLog() {
  $('log').innerHTML = board.log
    .map((e) => `<li><span class="${e.ok ? 'ok' : 'bad'}">${e.ok ? '✓' : '✗'}</span> <b>${esc(e.who)}</b> ${esc(e.action)}: ${esc(e.detail)}</li>`)
    .join('');
}

function render() {
  renderPeople();
  renderCompose();
  renderReports();
  renderAdmin();
  renderPublic();
  renderLog();
}

document.addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
  if (!t || busy) return;
  if (t.dataset.person) {
    me = t.dataset.person as PersonId;
    render();
    return;
  }
  const id = t.dataset.id !== undefined ? BigInt(t.dataset.id) : 0n;
  switch (t.dataset.do) {
    case 'post': {
      const text = ($('text') as HTMLTextAreaElement).value.trim();
      const sealed = (document.getElementById('sealed') as HTMLInputElement | null)?.checked;
      if (text) void act(() => (sealed ? board.postSealed(me, text) : board.post(me, text)));
      break;
    }
    case 'endorse':
      void act(() => board.endorse(me, id));
      break;
    case 'followUp': {
      const text = (document.getElementById(`fu-${id}`) as HTMLInputElement).value.trim();
      if (text) void act(() => board.followUp(me, id, text));
      break;
    }
    case 'enrol':
      void act(() => board.enrol(t.dataset.who as PersonId, me));
      break;
    case 'nextRound':
      void act(() => board.nextRound(me));
      break;
    case 'publishKey':
      void act(() => board.publishBoxKey(me));
      break;
    case 'respond': {
      const rid = BigInt(($('r-id') as HTMLSelectElement).value);
      const status = Number(($('r-status') as HTMLSelectElement).value) as Status;
      const text = ($('r-text') as HTMLInputElement).value.trim() || STATUS[status];
      void act(() => board.respond(rid, status, text, me));
      break;
    }
  }
});

board = await Board.create();
render();
