#!/usr/bin/env python3
"""
Resilient yt-dlp wrapper for Watch Party.

Monkey-patches InfoExtractor._search_regex so that "Unable to extract title"
(a common breakage when adult/streaming sites change their HTML markup) becomes
a soft fallback instead of a fatal error -- the stream URL extraction still
proceeds and we return whatever metadata we can.

Usage: python3 extract.py <url>
Stdout: single-line JSON of the extracted info (or {"error": "..."}).
"""
import json
import os
import sys

YTDLP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "yt-dlp")
sys.path.insert(0, YTDLP_PATH)

from yt_dlp import YoutubeDL  # noqa: E402
from yt_dlp.extractor.common import InfoExtractor  # noqa: E402
from yt_dlp.utils import ExtractorError  # noqa: E402

_orig_search_regex = InfoExtractor._search_regex


def _patched_search_regex(self, pattern, string, name, *args, **kwargs):
    try:
        return _orig_search_regex(self, pattern, string, name, *args, **kwargs)
    except ExtractorError:
        soft_fields = ("title", "uploader", "description", "thumbnail", "duration")
        if any(s in str(name).lower() for s in soft_fields):
            kwargs.pop("default", None)
            return kwargs.get("default") if "default" in kwargs else None
        raise


InfoExtractor._search_regex = _patched_search_regex


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no URL supplied"}))
        sys.exit(2)
    url = sys.argv[1]

    # Standard browser-like headers to bypass basic anti-bot blocks
    http_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.google.com/",
    }

    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "socket_timeout": 20,
        "retries": 3,
        "fragment_retries": 3,
        "http_headers": http_headers,
        # Age-gate bypass for adult sites
        "age_limit": 99,
        "username": "oauth2",
        "password": "",
    }

    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False, process=False)
            if info is None:
                print(json.dumps({"error": "no info returned"}))
                sys.exit(3)
            sanitized = ydl.sanitize_info(info)
            print(json.dumps(sanitized, default=str))
    except ExtractorError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(4)
    except Exception as e:
        print(json.dumps({"error": "{}: {}".format(type(e).__name__, e)}))
        sys.exit(5)


if __name__ == "__main__":
    main()
