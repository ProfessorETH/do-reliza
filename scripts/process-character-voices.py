"""Validate and master original ElevenLabs recordings; keep the raw takes in output/."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "output/cast-audio"
FILTER = "highpass=f=60,loudnorm=I=-18:TP=-2.5:LRA=9"


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    return subprocess.run([str(x) for x in args], check=True, capture_output=True, text=True).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--finalize", action="store_true", help="Publish manifests only when every expected line is validated")
    args = parser.parse_args()
    expected = {line["key"]: line for line in read(ROOT / "content/voice-lines.json")}
    designs = read(ROOT / "content/voice-designs.json")["voices"]
    jobs = read(ROOT / "output/original-voice-jobs.json")
    report_path = OUTPUT / "processed.json"
    report = {line["key"]: line for line in read(report_path)} if report_path.exists() else {}
    for job in jobs:
        if job["status"] != "ready-local" or not job.get("modelVerified"):
            continue
        key = job["key"]
        line = expected[key]
        if any(job[field] != line[field] for field in ("id", "kind", "text")):
            raise ValueError(f"Recording/caption mismatch: {key}")
        if job["voiceId"] != designs[line["id"]]["voiceId"] or job["model"] != "eleven_v4":
            raise ValueError(f"Unexpected voice or model: {key}")
        raw = (ROOT / job["rawFile"]).resolve()
        if not raw.is_relative_to((OUTPUT / "raw").resolve()) or not raw.is_file():
            raise ValueError(f"Missing preserved raw take: {key}")
        folder = "onboarding" if line["id"] == "nika" else "characters"
        dest = ROOT / "assets" / folder / "audio" / f"{key}-original.mp3"
        dest.parent.mkdir(parents=True, exist_ok=True)
        source_hash = sha(raw)
        old = report.get(key, {})
        if old.get("modelVerified") and old.get("sourceSha256") == source_hash and dest.exists() and sha(dest) == old.get("sha256"):
            continue
        if old.get("sourceSha256") != source_hash or not dest.exists() or sha(dest) != old.get("sha256"):
            # No low-pass, pitch change, room effect or strong denoising on clean synthetic speech.
            run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", raw,
                "-af", FILTER, "-ar", "44100", "-ac", "1", "-codec:a", "libmp3lame", "-q:a", "3", dest)
        run("ffmpeg", "-v", "error", "-i", dest, "-f", "null", "-")
        info = json.loads(run("ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,sample_rate,channels", "-of", "json", dest))
        seconds = float(info["format"]["duration"])
        stream = info["streams"][0]
        if not .5 < seconds < 90 or stream["codec_name"] != "mp3" or stream["channels"] != 1:
            raise ValueError(f"Invalid audio: {key}")
        report[key] = {**line, "voiceId": job["voiceId"], "model": "eleven_v4", "modelVerified": True,
                       "historyItemId": job.get("historyItemId"),
                       "generationText": job.get("generationText", job["text"]),
                       "path": dest.relative_to(ROOT).as_posix(), "sourceSha256": source_hash,
                       "sha256": sha(dest), "bytes": dest.stat().st_size, "durationSeconds": seconds}
    write(report_path, list(report.values()))
    ready = {key: report[key] for key in expected if key in report and report[key].get("modelVerified") and report[key]["text"] == expected[key]["text"]}
    print(f"Validated and mastered {len(ready)}/{len(expected)} lines.")
    if not args.finalize:
        return
    missing = set(expected) - set(ready)
    if missing:
        raise ValueError("Cannot publish incomplete pack: " + ", ".join(sorted(missing)))
    for entry in ready.values():
        if sha(ROOT / entry["path"]) != entry["sha256"]:
            raise ValueError("Audio changed after validation: " + entry["key"])
    nika = {key: row["path"].removeprefix("assets/onboarding/") for key, row in ready.items() if row["id"] == "nika"}
    cast = {key: row["path"].removeprefix("assets/") for key, row in ready.items() if row["id"] != "nika"}
    for relative, name, mapping in [("assets/onboarding/voice-manifest.js", "VOICE_ASSETS", nika),
                                     ("assets/character-voice-manifest.js", "CHARACTER_VOICES", cast)]:
        (ROOT / relative).write_text("// Original synthetic voices; validated local MP3 recordings.\nexport const " + name + " = " + json.dumps(mapping, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    with (ROOT / "assets/character-voice-manifest.js").open("a", encoding="utf-8") as manifest:
        manifest.write("\nexport const CHARACTER_VOICE_TEXT = " + json.dumps({key:row["text"] for key,row in ready.items() if row["id"] != "nika"}, ensure_ascii=False, indent=2) + ";\n")
    write(ROOT / "content/character-voice-receipt.json", {"provider": "ElevenLabs", "model": "eleven_v4",
          "origin": "Original Voice Design; no person or reference audio", "processing": FILTER,
          "format": "MP3 mono 44100 Hz, libmp3lame q3", "lines": list(ready.values())})
    print(f"Published {len(nika)} Nika lines and {len(cast)} developer lines.")


if __name__ == "__main__":
    main()
