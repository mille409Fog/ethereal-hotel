"""The walkthrough a person reads: every decision, in order."""

from ci_triage.trace import render_trace

TRACE: list[dict[str, object]] = [
    {
        "type": "triage_trace",
        "case_id": "1-2",
        "job": "End-to-end",
        "workflow": "Code Quality",
        "branch": "dependabot/x",
        "version": "investigate.v1",
        "model": "sonnet",
        "recorded_at": "2026-10-15T12:00:00+00:00",
        "limits": {"max_turns": 12},
    },
    {
        "type": "system",
        "subtype": "init",
        "model": "claude-sonnet-5-5",
        "tools": ["mcp__triage__job_history", "StructuredOutput"],
    },
    {
        "type": "assistant",
        "message": {
            "id": "m1",
            "usage": {"input_tokens": 5, "cache_read_input_tokens": 9000},
            "content": [{"type": "thinking", "thinking": "Was it inherited?"}],
        },
    },
    {
        "type": "assistant",
        "message": {
            "id": "m1",
            "usage": {"input_tokens": 5, "cache_read_input_tokens": 9000},
            "content": [
                {
                    "type": "tool_use",
                    "name": "mcp__triage__job_history",
                    "input": {"branch": "development-alpha"},
                }
            ],
        },
    },
    {
        "type": "user",
        "message": {
            "content": [
                {
                    "type": "tool_result",
                    "is_error": False,
                    "content": [
                        {"type": "text", "text": "\n".join(f"l{n}" for n in range(12))}
                    ],
                }
            ]
        },
    },
    {
        "type": "assistant",
        "message": {
            "id": "m2",
            "usage": {"input_tokens": 7},
            "content": [{"type": "tool_use", "name": "StructuredOutput", "input": {}}],
        },
    },
    {
        "type": "result",
        "subtype": "success",
        "num_turns": 3,
        "duration_ms": 21500,
        "total_cost_usd": 0.0712,
        "structured_output": {
            "category": "threshold",
            "confidence": "high",
            "hypothesis": "Inherited from development.",
            "suggested_files": ["e2e/support/lobby.ts"],
            "fix_rationale": "The budget lives there.",
            "evidence": ["job failure, run failure"],
        },
    },
    {
        "type": "triage_outcome",
        "source": "agent",
        "category": "threshold",
        "fallback_reason": None,
        "stopped_by": None,
    },
]


def test_a_trace_reads_turn_by_turn() -> None:
    text = render_trace(TRACE)
    assert text.startswith("# 1-2: End-to-end")
    assert "Session: claude-sonnet-5-5, tools: job_history (+1 built-in)" in text
    # One message split across two events is still one turn.
    assert text.count("## Turn 1 · context 9,005 tokens") == 1
    assert "thinks: Was it inherited?" in text
    assert '→ job_history {"branch": "development-alpha"}' in text
    assert "← l0" in text and "  l7" in text and "  … 4 more line(s)" in text
    assert "## Turn 2" in text and "→ answers (StructuredOutput)" in text
    assert "## Result: success after 3 turn(s), 21.5s, $0.0712 notional" in text
    assert "category: threshold (high confidence)" in text
    assert "suggested files: e2e/support/lobby.ts" in text
    assert "Recorded as: threshold from agent" in text


def test_redacted_thinking_is_marked_not_printed_blank() -> None:
    event: dict[str, object] = {
        "type": "assistant",
        "message": {"id": "m", "content": [{"type": "thinking", "thinking": ""}]},
    }
    text = render_trace([event])
    assert "(thinks)" in text
    assert "thinks: " not in text


def test_a_fallback_says_why() -> None:
    text = render_trace(
        [
            {
                "type": "triage_outcome",
                "source": "rules",
                "category": "threshold",
                "fallback_reason": "time limit reached (120s)",
                "stopped_by": "time limit reached (120s)",
            }
        ]
    )
    assert "Fallback because: time limit reached (120s)" in text
    assert "Stopped by: time limit reached (120s)" in text
