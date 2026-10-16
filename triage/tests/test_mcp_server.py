"""The MCP server: the protocol as a function, and once as the real process."""

import io
import json
import subprocess
import sys
from pathlib import Path

import mcp_server
from ci_triage.corpus import write_json
from ci_triage.tools import TOOLS, CaseContext, Git
from mcp_server import PROTOCOL_VERSION, make_handler, serve

CTX = CaseContext(
    sha="0" * 40,
    workflow="Code Quality",
    job="End-to-end",
    branch="main",
    created_at="2026-10-01T00:00:00Z",
    history={"main": ()},
    earlier=(),
)


def no_git(args: list[str]) -> tuple[int, str, str]:
    raise AssertionError(f"git should not run: {args}")


def request(
    method: str, params: dict[str, object] | None = None, rid: int = 1
) -> dict[str, object]:
    message: dict[str, object] = {"jsonrpc": "2.0", "id": rid, "method": method}
    if params is not None:
        message["params"] = params
    return message


def handle(message: object, git: Git = no_git) -> dict[str, object] | None:
    return make_handler(CTX, git)(message)


def test_initialize_answers_with_the_clients_version_and_tools_capability() -> None:
    reply = handle(request("initialize", {"protocolVersion": "2099-01-01"}))
    assert reply is not None
    result = reply["result"]
    assert isinstance(result, dict)
    assert result["protocolVersion"] == "2099-01-01"
    assert result["capabilities"] == {"tools": {}}
    fallback = handle(request("initialize", {}))
    assert fallback is not None
    assert fallback["result"]["protocolVersion"] == PROTOCOL_VERSION  # type: ignore[index]


def test_a_notification_gets_no_reply() -> None:
    assert handle({"jsonrpc": "2.0", "method": "notifications/initialized"}) is None


def test_tools_list_advertises_every_tool_with_its_schema() -> None:
    reply = handle(request("tools/list"))
    assert reply is not None
    tools = reply["result"]["tools"]  # type: ignore[index]
    assert [t["name"] for t in tools] == [t.name for t in TOOLS]
    assert all("inputSchema" in t and t["description"] for t in tools)


def test_a_tool_error_is_a_result_the_model_reads_not_a_protocol_error() -> None:
    reply = handle(request("tools/call", {"name": "job_history", "arguments": {}}))
    assert reply is not None
    assert "error" not in reply
    result = reply["result"]
    assert isinstance(result, dict)
    assert result["isError"] is True
    assert "`branch` must be" in result["content"][0]["text"]


def test_tools_call_runs_the_tool() -> None:
    reply = handle(
        request("tools/call", {"name": "job_history", "arguments": {"branch": "main"}})
    )
    assert reply is not None
    result = reply["result"]
    assert isinstance(result, dict)
    assert result["isError"] is False
    assert result["content"][0]["text"].startswith("No earlier runs")


def test_unknown_methods_and_malformed_messages_are_protocol_errors() -> None:
    unknown = handle(request("resources/list"))
    assert unknown is not None and unknown["error"]["code"] == -32601  # type: ignore[index]
    bad = handle({"id": 1, "method": "ping"})
    assert bad is not None and bad["error"]["code"] == -32600  # type: ignore[index]
    nameless = handle(request("tools/call", {"arguments": {}}))
    assert nameless is not None and nameless["error"]["code"] == -32602  # type: ignore[index]


def test_serve_answers_line_by_line_and_survives_garbage() -> None:
    lines = [
        json.dumps(request("ping", rid=7)),
        "",
        "{not json",
        json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}),
    ]
    stdin = io.BytesIO(("\n".join(lines) + "\n").encode("utf-8"))
    stdout = io.BytesIO()
    serve(make_handler(CTX, no_git), stdin, stdout)
    replies = [json.loads(line) for line in stdout.getvalue().splitlines()]
    assert replies[0] == {"jsonrpc": "2.0", "id": 7, "result": {}}
    assert replies[1]["error"]["code"] == -32700
    assert len(replies) == 2


def test_the_real_process_speaks_the_protocol(tmp_path: Path) -> None:
    context = tmp_path / "context.json"
    write_json(context, CTX.to_json())
    messages = [
        request("initialize", {"protocolVersion": PROTOCOL_VERSION}, rid=1),
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        request("tools/list", rid=2),
        request("tools/call", {"name": "earlier_failures", "arguments": {}}, rid=3),
    ]
    done = subprocess.run(
        [
            sys.executable,
            mcp_server.__file__,
            "--context",
            str(context),
            "--repo",
            str(tmp_path),
        ],
        input="".join(json.dumps(m) + "\n" for m in messages),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        check=True,
    )
    replies = [json.loads(line) for line in done.stdout.splitlines()]
    assert [r["id"] for r in replies] == [1, 2, 3]
    assert replies[2]["result"]["content"][0]["text"].startswith("No earlier failures")


def test_the_server_refuses_to_start_without_its_arguments() -> None:
    assert mcp_server.main([]) == 2
