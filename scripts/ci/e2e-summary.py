"""Expose Playwright results in CI step names without exposing credentials."""

import json
import os
import re
import sys
from pathlib import Path


def summarize(data):
    failures = []

    def collect(suite, parents):
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                if test.get("status") != "unexpected":
                    continue
                result = next(
                    (r for r in reversed(test.get("results", [])) if r.get("error")), {}
                )
                error = result.get("error", {})
                location = error.get("location", {})
                line = location.get("line", spec.get("line", "?"))
                reason = re.sub(r"\x1b\[[0-9;]*m", "", error.get("message", ""))
                reason = " / ".join(reason.splitlines())[:400]
                title = " > ".join(parents + [spec["title"]])
                failures.append(f"{title}:{line}: {reason}")
        for child in suite.get("suites", []):
            collect(child, parents + [child.get("title", "")])

    for suite in data.get("suites", []):
        collect(suite, [suite.get("title", "")])
    stats = data.get("stats", {})
    counts = ", ".join(
        f"{label} {stats.get(key, '?')}"
        for label, key in [("passed", "expected"), ("failed", "unexpected"), ("flaky", "flaky")]
    )
    summary = " | ".join(failures[:3]) or "See test report"
    for key, value in os.environ.items():
        if len(value) >= 6 and re.search(r"password|secret|token|key", key, re.I):
            summary = summary.replace(value, "[redacted]")
    return counts, summary[:1400]


if __name__ == "__main__":
    report = Path(sys.argv[1])
    counts, summary = summarize(json.loads(report.read_text()) if report.exists() else {})
    print(f"{counts}\n{summary}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"counts={counts}\nsummary={summary}\n")
