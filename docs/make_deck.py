"""Renders the Murmur slide deck to PNG slides and one PDF (docs/murmur-deck.pdf)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG, PANEL, INK, MUTED, ACCENT, LINE = (18, 17, 25), (30, 28, 41), (236, 234, 244), (162, 159, 182), (143, 130, 255), (54, 51, 70)
OK, BAD = (74, 222, 128), (248, 113, 113)
FONTS = Path("C:/Windows/Fonts")
OUT = Path(__file__).parent / "slides"
OUT.mkdir(exist_ok=True)


def font(size, bold=False, mono=False):
    name = "consola.ttf" if mono else ("segoeuib.ttf" if bold else "segoeui.ttf")
    return ImageFont.truetype(str(FONTS / name), size)


def wrap(d, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def text_block(d, xy, text, f, fill=INK, width=1600, gap=1.35):
    x, y = xy
    for line in wrap(d, text, f, width):
        d.text((x, y), line, font=f, fill=fill)
        y += int(f.size * gap)
    return y


def base(title, kicker=None):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 10], fill=ACCENT)
    if kicker:
        d.text((120, 90), kicker.upper(), font=font(30, bold=True), fill=ACCENT)
    d.text((120, 135), title, font=font(68, bold=True), fill=INK)
    d.text((120, H - 70), "Murmur · Midnight Buildathon, Wave 3", font=font(26), fill=MUTED)
    return im, d


def bullets(d, items, y=300, size=40, width=1650):
    f = font(size)
    for it in items:
        d.ellipse([125, y + size * 0.45, 141, y + size * 0.45 + 16], fill=ACCENT)
        y = text_block(d, (170, y), it, f, width=width) + 22
    return y


slides = []

# 1. Title
im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)
d.rectangle([0, 0, W, 10], fill=ACCENT)
d.text((120, 300), "Murmur", font=font(150, bold=True), fill=INK)
text_block(d, (125, 500), "Anonymous, verified feedback for teams, built on Midnight.", font(52), fill=INK, width=1600)
text_block(d, (125, 620), "Only members can post. Nobody, not even the admin, can tell which member did.", font(40), fill=MUTED, width=1600)
d.text((125, 860), "github.com/emilpz320-a11y/murmur-midnight", font=font(34, mono=True), fill=ACCENT)
d.text((125, 915), "emilpz320-a11y.github.io/murmur-midnight", font=font(34, mono=True), fill=ACCENT)
slides.append(im)

# 2. Problem
im, d = base("Honest feedback breaks one of two ways", "The problem")
bullets(d, [
    "Named feedback is trusted, but people hold back on the things that matter: a skipped safety step, a manager problem, a process that keeps failing.",
    "Anonymous forms get candour, but anyone can post, one person can post fifty times, and whoever runs the form can usually see who wrote what.",
    "Teams end up choosing between trust and candour. Murmur gives both at once.",
])
slides.append(im)

# 3. How it works
im, d = base("Zero-knowledge membership, two ledgers", "How it works")
d.rounded_rectangle([120, 290, 930, 790], 24, fill=PANEL)
d.rounded_rectangle([990, 290, 1800, 790], 24, fill=PANEL)
d.text((160, 320), "Public ledger (on chain)", font=font(40, bold=True), fill=INK)
d.text((1030, 320), "Private state (member's device)", font=font(40, bold=True), fill=INK)
y = 400
for t in ["Admin key, member keys, Merkle tree of members", "Reports, rounds, status, endorsement counts", "Author follow-ups and admin replies", "Spent nullifiers and one author tag per report"]:
    y = text_block(d, (160, y), "· " + t, font(34), width=730) + 14
y = 400
for t in ["The member's 32-byte secret key", "The Merkle path of their own key, computed locally", "Never sent anywhere: the circuit proves facts about it"]:
    y = text_block(d, (1030, y), "· " + t, font(34), width=730) + 14
text_block(d, (120, 840), "post() proves 'my key is a leaf of this tree' without revealing which leaf, and spends a round nullifier H(secret, round, contract).", font(32), fill=MUTED, width=1700)
slides.append(im)

# 4. Circuits
im, d = base("Six circuits", "The contract")
rows = [("enrol(pk)", "admin", "admin key, not enrolled yet, list not full"),
        ("nextRound()", "admin", "admin key; gives every member one new post"),
        ("post(text)", "member", "Merkle membership proof, round nullifier unused"),
        ("endorse(id)", "member", "membership proof, one nullifier per report"),
        ("followUp(id, text)", "author", "reproduces the report's author tag"),
        ("respond(id, status, text)", "admin", "acknowledge or resolve, public reply")]
y = 300
d.text((120, y), "Circuit", font=font(32, bold=True), fill=MUTED)
d.text((720, y), "Who", font=font(32, bold=True), fill=MUTED)
d.text((960, y), "What it checks", font=font(32, bold=True), fill=MUTED)
y += 60
for c, who, what in rows:
    d.line([120, y - 12, 1800, y - 12], fill=LINE, width=2)
    d.text((120, y), c, font=font(34, mono=True), fill=ACCENT)
    d.text((720, y), who, font=font(34), fill=INK)
    d.text((960, y), what, font=font(34), fill=INK)
    y += 88
slides.append(im)

# 5. Privacy
im, d = base("What an observer can and cannot learn", "Privacy")
y = bullets(d, [
    "No secret key is ever on the ledger: the tests search the whole public state for every secret after a full run.",
    "A report cannot be linked to a member: nullifiers and author tags are hashes with the secret, and match no member key.",
    "Two reports by the same member cannot be linked: tags depend on the round and the report id. Values are bound to the contract instance.",
], y=290, size=38)
d.text((120, y + 10), "Stated limits", font=font(36, bold=True), fill=MUTED)
bullets(d, ["The text itself can identify its author; small member sets give weak anonymity; transactions should be relayed in production."], y=y + 70, size=34)
slides.append(im)

# 6. Quality
im, d = base("Compiles, tested, running", "Engineering and QA")
bullets(d, [
    "Compact 0.36.0 compiles the contract in CI on every push (6 circuits, proving keys), because the compiler has no Windows build.",
    "13 simulator tests with Midnight's compact-runtime: every rule, every refusal with its exact message, and the three privacy properties.",
    "Live demo: the compiled contract runs in the browser for five people (admin, three members, one outsider), each holding only their own secret.",
    "Apache-2.0, README with the privacy design, circuits, guarantees and limits.",
])
slides.append(im)

# 7. Market and roadmap
im, d = base("Who needs it, and what comes next", "Product and roadmap")
y = bullets(d, [
    "Teams and DAOs that want incident reports, retros and whistleblowing without losing accountability.",
    "Pricing path: free public boards; paid private boards with encrypted reports and admin analytics.",
], y=290, size=38)
d.text((120, y + 10), "Next", font=font(36, bold=True), fill=MUTED)
bullets(d, [
    "Deploy to Midnight Preprod and connect the demo to the Lace wallet.",
    "Encrypted reports readable only by the admin; member key rotation; several boards per organisation.",
], y=y + 70, size=36)
slides.append(im)

# 8. Links
im, d = base("Try it", "Links")
y = 320
for label, url in [("Live demo", "emilpz320-a11y.github.io/murmur-midnight"),
                   ("Source (Apache-2.0)", "github.com/emilpz320-a11y/murmur-midnight"),
                   ("Contract", "contract/murmur.compact"),
                   ("Tests", "src/test/murmur.test.ts  ·  npm test")]:
    d.text((120, y), label, font=font(36, bold=True), fill=MUTED)
    d.text((120, y + 50), url, font=font(44, mono=True), fill=ACCENT)
    y += 150
slides.append(im)

paths = []
for i, s in enumerate(slides, 1):
    p = OUT / f"slide-{i:02d}.png"
    s.save(p)
    paths.append(p)
slides[0].save(Path(__file__).parent / "murmur-deck.pdf", save_all=True, append_images=slides[1:], resolution=150)
print(len(paths), "slides")
