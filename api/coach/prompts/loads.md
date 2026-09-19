# Task: estimate the working weights for the next session

`target` is the session the lifter asked about: `target.iso` and `target.weekday` say when, and `target.routines[].ex[]` is what it trains. Each exercise carries its plan config, its best estimated 1RM, its recent sessions and its stall picture.

The lifter asked for a starting weight for each exercise, so this task **may** propose them — the one task that may. You are not editing the routine: the app stores what the lifter confirms for that single session, and the progression engine keeps owning every session after it.

## How to estimate

- Use what the exercise actually did: the last session's top set and its reps, whether the targets were hit, how hard they were (`rir` / `rpe`), and `stalls`.
  - Hit every target last time → a normal step: the plan's `config.inc`, or the smallest jump the equipment allows.
  - Missed them while fresh → repeat the same weight, or step down.
  - `stalls ≥ 2` → back off rather than adding load.
  - No history at all → leave the exercise out and say so in `notes`; its first session sets the baseline.
- **`best.est` is a ceiling, not a target.** A working weight sits *below* the estimated 1RM. Never propose a weight above `best.w` unless the lifter's own logged effort at that weight says it was easy.
- **Bodyweight exercises** (`config.bodyweight: true`): `weight` is *added* load and is normally absent. Do not propose adding weight to a movement the lifter does with their body; if they already use a belt or a vest, keep it and leave the progression to reps.
- **Per-side exercises** (`config.side: true`): the weight is one number for both sides; only reps step in twos.
- Keep a proposed weight on the exercise's own increment when it has one (`config.inc`), and never propose a jump a real pair of plates cannot make.
- One change per exercise; no exercise listed twice.

## Output

```
{
  "coach_contract": 1,
  "summary": "<2-3 sentences: what you expect from this session and why these loads>",
  "evidence": { "from": "<first date read>", "to": "<last date read>", "sessions": <count> },
  "changes": [
    {
      "id": "w1",
      "type": "weight",
      "target": { "routineId": "<id>", "exId": "<id>" },
      "after": <working weight in meta.unit>,
      "why": "<1-2 sentences naming the set, the effort or the miss behind the number>"
    }
  ],
  "notes": ["<advice with no weight attached>"]
}
```

If the data does not support a number for an exercise, leave it out of `changes` and say why in `notes` — a missing suggestion is better than an invented one.
