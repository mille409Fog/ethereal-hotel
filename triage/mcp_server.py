"""The agent's tools, served to Claude Code over MCP. Hand-written, standard library.

MCP (Model Context Protocol) is JSON-RPC 2.0. Over stdio, each message is one line of
JSON. Claude Code starts this process for one triage, and the conversation goes:

    → initialize            ← our protocol version, capabilities, name
    → notifications/initialized       (a notification: no id, so no reply)
    → tools/list            ← each tool's name, description and input schema
    → tools/call {name, arguments}    ← {content: [{type: text, text}], isError}
    … until Claude Code closes stdin, and this process exits.

Written by hand rather than with the `mcp` SDK (ADR 0007): the package keeps no
runtime dependencies, and the three methods above are the whole protocol it needs.
The SDK would add transports, resources and prompts that nothing here uses.

stdout carries protocol messages and nothing else; a stray print would corrupt the
stream. Diagnostics go to stderr.

Run as a file, like cli.py, so triage/ lands on sys.path.
"""

import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import BinaryIO, Final

from ci_triage.corpus import read_json
from ci_triage.tools import TOOLS, CaseContext, Git, call_tool, real_git

SERVER_NAME: Final = "ci-triage"
# The version this server was written against. A client that asks for another gets
# its own back: the three methods used here have not changed between versions.
PROTOCOL_VERSION: Final = "2025-06-18"

PARSE_ERROR: Final = -32700
INVALID_REQUEST: Final = -32600
METHOD_NOT_FOUND: Final = -32601
INVALID_PARAMS: Final = -32602

Message = dict[str, object]


def _result(request_id: object, result: Message) -> Message:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: object, code: int, message: str) -> Message:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def make_handler(ctx: CaseContext, git: Git) -> Callable[[object], Message | None]:
    """The protocol, as a function: one parsed message in, one reply (or None) out."""

    def handle(message: object) -> Message | None:
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return _error(None, INVALID_REQUEST, "expected a JSON-RPC 2.0 object")
        method = message.get("method")
        params = message.get("params") or {}
        # A message without an id is a notification, and a notification gets no reply,
        # not even an error.
        if "id" not in message:
            return None
        request_id = message["id"]
        if not isinstance(method, str) or not isinstance(params, dict):
            return _error(request_id, INVALID_REQUEST, "method and params malformed")

        if method == "initialize":
            asked = params.get("protocolVersion")
            return _result(
                request_id,
                {
                    "protocolVersion": asked
                    if isinstance(asked, str)
                    else PROTOCOL_VERSION,
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": SERVER_NAME, "version": "1"},
                },
            )
        if method == "ping":
            return _result(request_id, {})
        if method == "tools/list":
            return _result(
                request_id,
                {
                    "tools": [
                        {
                            "name": tool.name,
                            "description": tool.description,
                            "inputSchema": tool.input_schema,
                        }
                        for tool in TOOLS
                    ]
                },
            )
        if method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments") or {}
            if not isinstance(name, str) or not isinstance(arguments, dict):
                return _error(request_id, INVALID_PARAMS, "name and arguments required")
            # A tool's failure is a result the model reads and recovers from, not a
            # protocol error: isError, with the tool's own advice as the text.
            text, is_error = call_tool(ctx, git, name, arguments)
            return _result(
                request_id,
                {"content": [{"type": "text", "text": text}], "isError": is_error},
            )
        return _error(request_id, METHOD_NOT_FOUND, f"unknown method {method}")

    return handle


def serve(
    handle: Callable[[object], Message | None], stdin: BinaryIO, stdout: BinaryIO
) -> None:
    """Read one JSON message per line until stdin closes; write each reply as a line."""
    for raw in stdin:
        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        try:
            message: object = json.loads(line)
        except ValueError:
            reply: Message | None = _error(None, PARSE_ERROR, "not JSON")
        else:
            reply = handle(message)
        if reply is not None:
            stdout.write(json.dumps(reply, ensure_ascii=False).encode("utf-8") + b"\n")
            stdout.flush()


def main(argv: list[str]) -> int:
    if len(argv) != 4 or argv[0] != "--context" or argv[2] != "--repo":
        print("usage: mcp_server.py --context <file> --repo <dir>", file=sys.stderr)
        return 2
    ctx = CaseContext.from_json(read_json(Path(argv[1])))
    serve(make_handler(ctx, real_git(argv[3])), sys.stdin.buffer, sys.stdout.buffer)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
