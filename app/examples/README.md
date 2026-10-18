# Incorrect code to try in Clueless

The examples are intentionally wrong. They are ordinary Python, with their input included.

## Browser preview (no credentials needed)

Run `npm.cmd run ui` from `app/`, then open http://localhost:5199.
Choose **Wrong condition** or **Early return** from the Example dropdown on the right.
Select the complete code below the dropdown and click **Ask**.
These are prepared replays of those exact examples, not live AI responses.
Other snippets and partial selections need the real Electron app.

During playback:

- **Pause / Resume** (or Space) holds the current step, then continues automatically.
- **Back** (or Left arrow) goes back exactly one step and pauses there. Click it again to keep going back.
- There is no forward button or clickable timeline. Resume replays every following step in order.
- You can go back after the animation finishes. Esc closes at any time.

## Real app (your selected code goes to Claude)

Start `npm.cmd run dev` with your usual credentials. Open one of the Python files, show the island,
select the entire file, and click **Ask** with Animate on. Including the function call makes the test
input explicit. If you select only a few lines, include the variables they depend on or keep that
context visible on screen; otherwise the AI may choose a different small input.

| File | What the code actually does | What to look for |
| --- | --- | --- |
| `wrong-condition.py` | Prints `True`; the intended answer is `False`. | The very first number is not in the empty set, so the function returns immediately. |
| `early-return.py` | Prints `False`; the intended answer is `True`. | Only `3` reaches `seen`. The function exits before reaching the duplicate `1`. |
| `wrong-call.py` | Raises `AttributeError`; no value is returned. | `seen` is a set, and a set has no `append` method. |

A useful question is: **“What does this code actually do on this input, and where does it first go wrong?”**
With Animate off, ask that as a follow-up. With Animate on, the selected code is traced as written,
including the bug. The real app uses AI reasoning rather than running Python, so its explanation
can vary; the outputs above are the actual Python behavior. Finishing a trace does not prove correctness.

You can also inspect the real AI trace in a terminal:

```powershell
npm.cmd run trace -- examples/wrong-condition.py --json
npm.cmd run trace -- examples/early-return.py --json
npm.cmd run trace -- examples/wrong-call.py --off
```
