"""Builds docs/murmur-demo.mp4: slides and demo screenshots with Windows TTS narration (voice Zira)."""
import subprocess
import sys
import wave
from pathlib import Path

import imageio_ffmpeg

HERE = Path(__file__).parent
SHOTS = Path(sys.argv[1])  # folder with the demo screenshots
WORK = HERE / "video-work"
WORK.mkdir(exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

S = lambda n: HERE / "slides" / f"slide-{n:02d}.png"
D = lambda name: SHOTS / name

SEGMENTS = [
    (S(1), "Murmur. Anonymous, verified feedback for teams, built on Midnight. Only members can post, and nobody, not even the admin, can tell which member did."),
    (S(2), "Honest feedback usually breaks one of two ways. Named feedback is trusted, but people hold back. Anonymous forms get candour, but anyone can post, one person can post fifty times, and whoever runs the form can often see who wrote what."),
    (S(3), "Murmur uses both of Midnight's ledgers. Member keys, reports and nullifiers are public. Each member's secret key stays on their device. To post, the circuit proves that the member's key is a leaf of the members Merkle tree, without revealing which leaf, and spends a nullifier for the current round."),
    (D("01-start.jpg"), "This is the live demo. It runs the real compiled Compact contract in the browser, for five people: an admin, three members and one outsider. Each person holds only their own secret key."),
    (D("02-enrolled.jpg"), "Morgan, the admin, enrols Ana, Ben and Cleo. Only their member keys, which are hashes of their secrets, become public."),
    (D("03-posted.jpg"), "Ana posts a report. The board shows the report, its round and an author tag, but nothing that points to Ana."),
    (D("04-ledger.jpg"), "Ben endorses the report once. When Ben tries to add a follow-up to a report he did not write, the contract refuses: only the author can reproduce the author tag. On the right, the demo searches the entire public ledger for every person's secret key, and finds none of them."),
    (D("05-reply.jpg"), "Ana adds a follow-up as the author, still anonymous. Morgan acknowledges the report and replies in public."),
    (S(4), "The contract has six circuits: enrol and next round for the admin, post and endorse for members, follow up for the author, and respond for the admin."),
    (S(5), "No secret key ever reaches the ledger, a report cannot be linked to a member, and two reports by the same member cannot be linked to each other. We also state the limits: the text itself can identify its author, and small groups give weak anonymity."),
    (S(6), "The contract compiles with Compact zero point thirty six in continuous integration, and thirteen simulator tests cover every rule, every refusal and the privacy properties."),
    (S(7), "Next, we will deploy to the Midnight preprod network, connect the Lace wallet, and add encrypted reports that only the admin can read."),
    (S(8), "Try the live demo and read the code on GitHub. Thank you."),
]


def tts(text: str, out: Path) -> float:
    ps = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.SelectVoice('Microsoft Zira Desktop'); $s.Rate = 0; "
        f"$s.SetOutputToWaveFile('{out}'); "
        f"$s.Speak([IO.File]::ReadAllText('{out.with_suffix('.txt')}')); $s.Dispose()"
    )
    out.with_suffix(".txt").write_text(text, encoding="utf-8")
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
    with wave.open(str(out)) as w:
        return w.getnframes() / w.getframerate()


parts = []
for i, (img, text) in enumerate(SEGMENTS):
    wav = WORK / f"seg{i:02d}.wav"
    dur = tts(text, wav) + 0.8
    mp4 = WORK / f"seg{i:02d}.mp4"
    vf = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x121119,format=yuv420p"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-loop", "1", "-framerate", "30", "-i", str(img), "-i", str(wav),
                    "-af", "apad", "-t", f"{dur:.2f}", "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "23",
                    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", str(mp4)], check=True)
    parts.append(mp4)
    print(f"segment {i}: {dur:.1f}s")

listing = WORK / "list.txt"
listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
out = HERE / "murmur-demo.mp4"
subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(out)], check=True)
print("wrote", out)
