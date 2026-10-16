"""Turn an investigation's JSONL trace into something a person can walk through.

The trace file (agent.py writes it) is the record: our header, every stream-json
event Claude Code emitted, and our verdict. This module only reads it. Each turn is
shown with its context size, what the model said or thought, the tool it chose with
its arguments, and the start of what the tool returned. That's enough to explain each
decision without opening the raw file.
"""

import json
from collections.abc import Iterable
from typing import Final

from ci_triage.models import JsonObject

TOOL_PREFIX: Final = "mcp__triage__"
RESULT_LINES: Final = 8
TEXT_CHARS: Final = 700


def read_trace(lines: Iterable[str]) -> list[JsonObject]:
    events = []
    for line in lines:
        if line.strip():
            event: object = json.loads(line)
            if isinstance(event, dict):
                events.append(event)
    return events


def _clip(text: str, limit: int = TEXT_CHARS) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[:limit] + " …"


def _tool_result_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(part.get("text", "")) for part in content if isinstance(part, dict)
        )
    return ""


def _blocks(event: JsonObject) -> list[JsonObject]:
    message = event.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    return (
        [b for b in content if isinstance(b, dict)] if isinstance(content, list) else []
    )


def render_trace(events: list[JsonObject]) -> str:
    out: list[str] = []
    seen_messages: set[str] = set()
    turn = 0
    for event in events:
        kind = event.get("type")
        if kind == "triage_trace":
            out += [
                f"# {event.get('case_id')}: {event.get('job')}",
                f"{event.get('workflow')} on `{event.get('branch')}` · "
                f"{event.get('version')} · {event.get('model')} · "
                f"recorded {event.get('recorded_at')}",
                f"Limits: {json.dumps(event.get('limits'))}",
                "",
            ]
        elif kind == "system" and event.get("subtype") == "init":
            tools = event.get("tools")
            ours = [
                str(t).removeprefix(TOOL_PREFIX)
                for t in (tools if isinstance(tools, list) else [])
                if str(t).startswith(TOOL_PREFIX)
            ]
            others = len(tools) - len(ours) if isinstance(tools, list) else 0
            out.append(
                f"Session: {event.get('model')}, tools: {', '.join(ours)}"
                + (f" (+{others} built-in)" if others else "")
            )
        elif kind == "assistant":
            message = event.get("message")
            message_id = str(message.get("id")) if isinstance(message, dict) else ""
            if message_id not in seen_messages:
                seen_messages.add(message_id)
                turn += 1
                usage = message.get("usage") if isinstance(message, dict) else None
                context = ""
                if isinstance(usage, dict):
                    total = sum(
                        v
                        for k in (
                            "input_tokens",
                            "cache_creation_input_tokens",
                            "cache_read_input_tokens",
                        )
                        if isinstance(v := usage.get(k), int)
                    )
                    context = f" · context {total:,} tokens"
                out += ["", f"## Turn {turn}{context}"]
            for block in _blocks(event):
                btype = block.get("type")
                if btype == "thinking":
                    # Claude Code streams thinking with its text redacted (only a
                    # signature), so an empty block says only that it thought.
                    thought = str(block.get("thinking", "")).strip()
                    out.append(f"thinks: {_clip(thought)}" if thought else "(thinks)")
                elif btype == "text" and str(block.get("text", "")).strip():
                    out.append(f"says: {_clip(str(block.get('text')))}")
                elif btype == "tool_use":
                    name = str(block.get("name", ""))
                    args = json.dumps(block.get("input"), ensure_ascii=False)
                    if name == "StructuredOutput":
                        out.append("→ answers (StructuredOutput)")
                    else:
                        out.append(f"→ {name.removeprefix(TOOL_PREFIX)} {args}")
        elif kind == "user":
            for block in _blocks(event):
                if block.get("type") != "tool_result":
                    continue
                text = _tool_result_text(block.get("content"))
                lines = text.splitlines() or [""]
                mark = "← ERROR " if block.get("is_error") else "← "
                out.append(mark + lines[0])
                out += [f"  {line}" for line in lines[1:RESULT_LINES]]
                if len(lines) > RESULT_LINES:
                    out.append(f"  … {len(lines) - RESULT_LINES} more line(s)")
        elif kind == "result":
            cost = event.get("total_cost_usd")
            cost_text = f"${cost:.4f}" if isinstance(cost, int | float) else "?"
            ms = event.get("duration_ms")
            seconds = ms / 1000 if isinstance(ms, int | float) else 0.0
            out += [
                "",
                f"## Result: {event.get('subtype')} after {event.get('num_turns')} "
                f"turn(s), {seconds:.1f}s, {cost_text} notional",
            ]
            answer = event.get("structured_output")
            if isinstance(answer, dict):
                files = ", ".join(map(str, answer.get("suggested_files") or []))
                out += [
                    f"category: {answer.get('category')} "
                    f"({answer.get('confidence')} confidence)",
                    f"hypothesis: {answer.get('hypothesis')}",
                    f"suggested files: {files}",
                    f"why: {answer.get('fix_rationale')}",
                    "evidence:",
                    *(
                        f"  - {_clip(str(e), 300)}"
                        for e in answer.get("evidence") or []
                    ),
                ]
        elif kind == "triage_outcome":
            out += [
                "",
                f"Recorded as: {event.get('category')} from {event.get('source')}",
            ]
            if event.get("fallback_reason"):
                out.append(f"Fallback because: {event.get('fallback_reason')}")
            if event.get("stopped_by"):
                out.append(f"Stopped by: {event.get('stopped_by')}")
    return "\n".join(out)
