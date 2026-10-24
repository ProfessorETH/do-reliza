"""Batch the approved cast through the official ElevenLabs CLI, without automatic retries."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
JOBS = ROOT / "output/original-voice-jobs.json"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def persist(jobs):
    JOBS.parent.mkdir(parents=True, exist_ok=True)
    temporary = JOBS.with_suffix(".tmp")
    temporary.write_text(json.dumps(jobs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(JOBS)


def now():
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Record missing lines using the existing subscription")
    parser.add_argument("--cli", default="elevenlabs", help="Path to the official native CLI executable")
    parser.add_argument("--key-file", type=Path, default=Path.home() / ".codex/secrets/elevenlabs.key")
    args = parser.parse_args()
    lines = load(ROOT / "content/voice-lines.json")
    voices = load(ROOT / "content/voice-designs.json")["voices"]
    jobs = load(JOBS) if JOBS.exists() else []
    existing = {job["key"]: job for job in jobs}
    if len(existing) != len(jobs):
        raise ValueError("Duplicate job keys: reconcile receipts before recording")
    missing = [line for line in lines if line["key"] not in existing]
    unresolved = [job for job in jobs if job["status"] != "ready-local" or not job.get("modelVerified")]
    print(f"Plan: {len(missing)} missing lines; {len(unresolved)} existing requests need recovery.")
    if not args.execute:
        print("No API requests sent. Use --execute after configuring CLI authentication.")
        return
    env = os.environ.copy()
    if args.key_file.is_file():
        env["ELEVENLABS_API_KEY"] = args.key_file.read_text(encoding="utf-8-sig").strip()
    env["ELEVENLABS_TIMEOUT_SECS"] = "180"
    # Credentials stay in the child environment/keyring, never command-line arguments.
    def cli(*command):
        result = subprocess.run([args.cli, *map(str, command), "--base-url", "https://api.elevenlabs.io", "--no-retry"],
                                cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", timeout=200)
        if result.returncode:
            # Do not echo provider responses or authentication material into shared logs.
            raise RuntimeError(f"ElevenLabs CLI failed (exit {result.returncode}); no automatic retry")
        return result.stdout
    raw_dir = ROOT / "output/cast-audio/raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    lock = raw_dir.parent / "record.lock"
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.write(descriptor, str(os.getpid()).encode())
    os.close(descriptor)
    try:
        for voice in voices.values():
            actual = json.loads(cli("voices", "get", "--voice-id", voice["voiceId"], "--format", "json"))
            if actual["name"] != voice.get("voiceName", voice["name"]) or actual.get("category") != "generated":
                raise ValueError("Expected the saved original Voice Design voice")
        # Recover already-submitted requests before making any new paid request.
        for job in unresolved:
            stamp = int(datetime.fromisoformat(job["submittedAt"].replace("Z", "+00:00")).timestamp())
            text = job.get("generationText", job["text"])
            response = json.loads(cli("history", "list", "--voice-id", job["voiceId"],
                                      "--model-id", "eleven_v4", "--source", "TTS", "--search", text[:32],
                                      "--date-after-unix", stamp - 120, "--date-before-unix", stamp + 300, "--format", "json"))
            def same_line(item):
                dialogue = item.get("dialogue")
                entry = dialogue[0] if dialogue and len(dialogue) == 1 else item
                return entry.get("text") == text and entry.get("voice_id") == job["voiceId"]
            matches = [item for item in response["history"] if same_line(item) and item.get("model_id") == "eleven_v4"]
            if not matches:
                raise RuntimeError(f"Unresolved request {job['key']}: inspect history; do not resubmit")
            item = matches[0]
            raw = raw_dir / f"{job['key']}-{job['voiceId']}.mp3"
            if raw.exists():
                digest = hashlib.sha256(raw.read_bytes()).hexdigest()[:16]
                archived = raw.with_name(raw.stem + "-browser-take-" + digest + raw.suffix)
                if not archived.exists():
                    shutil.copy2(raw, archived)
            cli("history", "get_audio", "--history-item-id", item["history_item_id"], "--output", raw)
            job.update(status="ready-local", rawFile=raw.relative_to(ROOT).as_posix(), historyItemId=item["history_item_id"], modelVerified=True, savedAt=now())
            persist(jobs)
            print(f"Recovered {job['key']}", flush=True)
        for line in missing:
            voice = voices[line["id"]]
            text = ("[annoyed] " if line["kind"] == "conflict" else "") + line["text"]
            raw = raw_dir / f"{line['key']}-{voice['voiceId']}.mp3"
            if raw.exists():
                raise ValueError("Unreceipted raw take exists: " + line["key"])
            job = {**line, "voiceId": voice["voiceId"], "voiceName": voice.get("voiceName", voice["name"]),
                   "generationText": text, "model": "eleven_v4", "source": "Original Voice Design via official ElevenLabs CLI",
                   "submittedAt": now(), "status": "submitting"}
            jobs.append(job)
            persist(jobs)
            cli("text-to-speech", "convert", "--voice-id", voice["voiceId"], "--model-id", "eleven_v4",
                "--language-code", "ru", "--voice-settings", '{"stability":0.5,"similarity_boost":0.75}',
                "--text", text, "--output-format", "mp3_44100_128", "--output", raw)
            if not raw.is_file() or raw.stat().st_size < 1000:
                raise RuntimeError("Invalid output; recover from history before resubmitting")
            job.update(status="ready-local", rawFile=raw.relative_to(ROOT).as_posix(), modelVerified=True, savedAt=now())
            persist(jobs)
            print(f"Recorded {line['key']}", flush=True)
    finally:
        lock.unlink()


if __name__ == "__main__":
    main()
