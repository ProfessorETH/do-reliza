"""Create a new shareable prompt/receipt summary; originals are read-only.

Uses only the Python standard library. Explicit input files avoid accidentally
publishing active job state. Owner objects and tokens are excluded recursively.
External absolute local paths are omitted; project paths become repo-relative.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re


ABSOLUTE = re.compile(r"(?:[A-Za-z]:[\\/]|\\\\|(?<![:\w])/Users/|(?<![:\w])/home/|(?<![:\w])/tmp/)")
OMIT = {"owner", "owner_token", "token", "access_token", "api_key", "authorization"}


def sanitize(value, root, redactions, location="$"):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if key.lower() in OMIT or ABSOLUTE.search(key):
                redactions.append(location + ".<operational field omitted>")
                continue
            result[key] = sanitize(item, root, redactions, location + "." + key)
        return result
    if isinstance(value, list):
        return [sanitize(item, root, redactions, location + "[]") for item in value]
    if not isinstance(value, str) or not ABSOLUTE.search(value):
        return value
    normalized = value.replace("\\", "/")
    prefix = root.as_posix().rstrip("/")
    if normalized.casefold().startswith(prefix.casefold() + "/"):
        return normalized[len(prefix)+1:]
    # Redact the whole field when a local path occurs in prose: a partial regex
    # could leave a username or part of a path with spaces behind.
    redactions.append(location)
    return {"local_path_or_text_omitted": True,
            "original_text_sha256": hashlib.sha256(value.encode("utf-8")).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root, output = args.project_root.resolve(), args.output.resolve()
    if output.exists() or output in [p.resolve() for p in args.inputs]:
        raise RuntimeError("Choose a new versioned output; overwrites are refused")
    documents = []
    for source in args.inputs:
        source = source.resolve()
        # Only project files can be included, so provenance cannot leak local paths.
        relative = source.relative_to(root).as_posix()
        data = source.read_bytes()
        redactions = []
        public = sanitize(json.loads(data.decode("utf-8-sig")), root, redactions)
        documents.append(dict(source=relative, source_sha256=hashlib.sha256(data).hexdigest(),
                              redacted_fields=redactions, content=public))
        if source.read_bytes() != data:
            raise RuntimeError("Source changed during read; retry only after job is stable")
    summary = dict(schema="body-v5-public-summary-v1", version=args.version,
                   policy="Local originals unchanged; owner/token omitted; local paths redacted or project-relative",
                   documents=documents)
    payload = json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    if ABSOLUTE.search(payload):
        raise RuntimeError("Absolute path remains after sanitization; no output written")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as stream:
        stream.write(payload)
    print(json.dumps(dict(output=output.relative_to(root).as_posix(), documents=len(documents))))


if __name__ == "__main__":
    main()
