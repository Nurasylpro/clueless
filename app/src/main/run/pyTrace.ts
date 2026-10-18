// The Python side of "run the code": loaded once into Pyodide, then called per highlight.
// It runs the student's code on a small input with sys.settrace and records each line that runs
// and the variables it changed. The TypeScript side (python.ts) turns that into a CodeTrace.
//
// run_trace(setup, code, call, max_steps, max_ms, indexed_json) -> JSON string:
//   steps: [{ line, frame, kind: 'call'|'line', result, updates: [[name, kind, payload]] }]
//     ('call' = a function's arguments, or loose code's inputs)
//   error: "IndexError: ..." if the code raised; errorInSnippet: whether it was raised in the code
//   setupError: the setup itself failed (bad input from the model) -> fall back
//   stopped: "steps" | "time" when a cap ended the run; stdout: what it printed

export const TRACE_PY = String.raw`
import sys, json, time, types, io, contextlib, collections

PRELUDE = '''
from typing import *
import collections, heapq, math, bisect, itertools, functools, string, re
from collections import Counter, defaultdict, deque, OrderedDict
from heapq import heappush, heappop, heapify
from math import inf
from functools import lru_cache, cache

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
'''

CO_OPTIMIZED = 0x0001
SKIP = (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, types.MethodType, type)
DEF_LINE = ('def ', 'async def ', 'class ', '@', 'import ', 'from ')

class _Stop(BaseException):
    pass

def _sorted(items):
    items = list(items)
    try:
        return sorted(items)
    except TypeError:
        return sorted(items, key=repr)

def _short(v, depth=0):
    if isinstance(v, str):
        if depth == 0:
            r = repr(v)
            return r if len(r) <= 40 else r[:39] + '…'
        return v if len(v) <= 12 else v[:11] + '…'
    if v is None or isinstance(v, (bool, int)):
        return repr(v)
    if isinstance(v, float):
        return repr(round(v, 4)) if v == v and abs(v) != float('inf') else repr(v)
    if depth >= 2:
        return '…'
    if hasattr(v, 'val') and hasattr(v, 'next'):
        out, node = [], v
        while node is not None and len(out) < 8:
            out.append(_short(node.val, depth + 1))
            node = getattr(node, 'next', None)
        return ' → '.join(out) + (' → …' if node is not None else '')
    if hasattr(v, 'val') and hasattr(v, 'left') and hasattr(v, 'right'):
        return 'node ' + _short(v.val, depth + 1)
    if isinstance(v, (list, tuple, collections.deque)):
        items = list(v)
        inner = ', '.join(_short(x, depth + 1) for x in items[:8]) + (', …' if len(items) > 8 else '')
        return '(' + inner + ')' if isinstance(v, tuple) else '[' + inner + ']'
    if isinstance(v, (set, frozenset)):
        items = _sorted(v)
        return '{' + ', '.join(_short(x, depth + 1) for x in items[:8]) + (', …' if len(items) > 8 else '') + '}'
    if isinstance(v, dict):
        pairs = list(v.items())
        return '{' + ', '.join(_short(k, depth + 1) + ': ' + _short(x, depth + 1) for k, x in pairs[:6]) + (', …' if len(pairs) > 6 else '') + '}'
    r = repr(v)
    return r if len(r) <= 24 else r[:23] + '…'

def _is_grid(v):
    if not v or len(v) > 16:
        return False
    for row in v:
        if not isinstance(row, (list, tuple)) or len(row) > 16:
            return False
        for x in row:
            if isinstance(x, (list, tuple, set, frozenset, dict)):
                return False
    return True

def _snap(v, indexed):
    if v is None or isinstance(v, (bool, int, float)):
        return ['value', {'scalar': _short(v)}]
    if isinstance(v, str):
        if indexed and len(v) <= 40:
            return ['array', {'items': list(v)}]
        return ['value', {'scalar': _short(v)}]
    if isinstance(v, (list, tuple, collections.deque)):
        items = list(v)
        if _is_grid(items):
            return ['grid', {'rows': [[_short(x, 1) for x in row] for row in items]}]
        return ['array', {'items': [_short(x, 1) for x in items[:40]]}]
    if isinstance(v, (set, frozenset)):
        return ['set', {'items': [_short(x, 1) for x in _sorted(v)[:40]]}]
    if isinstance(v, dict):
        return ['map', {'entries': [{'key': _short(k, 1), 'value': _short(x, 1)} for k, x in list(v.items())[:30]]}]
    return ['value', {'scalar': _short(v)}]

def _err(e):
    text = str(e)
    return type(e).__name__ + (': ' + text if text else '')

def run_trace(setup, code, call, max_steps, max_ms, indexed_json):
    indexed = set(json.loads(indexed_json))
    out = {'steps': [], 'error': '', 'errorInSnippet': False, 'setupError': '', 'stopped': '', 'stdout': '', 'value': ''}
    g = {'__name__': '__main__'}
    exec(PRELUDE, g)
    g['input'] = lambda *a: (_ for _ in ()).throw(RuntimeError("input() can't be used here"))
    base = set(g.keys())
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(setup, '<setup>', 'exec'), g)
    except BaseException as e:
        out['setupError'] = _err(e)
        return json.dumps(out)
    try:
        snippet = compile(code, '<snippet>', 'exec')
    except SyntaxError as e:
        out['setupError'] = 'SyntaxError: ' + str(e.msg) + ' (line ' + str(e.lineno) + ')'
        return json.dumps(out)

    lines = code.split('\n')
    steps = out['steps']
    frame_ids = {}
    open_step = {}
    snaps = {}
    last_step = {}
    module_inputs = {}
    state = {'count': 0, 'stopping': ''}
    started = time.monotonic()

    def fid(frame):
        key = id(frame)
        if key not in frame_ids:
            frame_ids[key] = len(frame_ids) + 1
        return frame_ids[key]

    def frame_vars(frame):
        res = {}
        module = frame.f_code.co_name == '<module>'
        for name, v in list(frame.f_locals.items()):
            if name.startswith('__') or name == 'self' or (module and name in base) or isinstance(v, SKIP):
                continue
            res[name] = _snap(v, name in indexed)
        return res

    def close(frame):
        f = fid(frame)
        now = frame_vars(frame)
        i = open_step.pop(f, None)
        if i is not None:
            before = snaps.get(f, {})
            steps[i]['updates'] = [[n, s[0], s[1]] for n, s in now.items() if before.get(n) != s]
        snaps[f] = now

    def budget():
        if state['stopping']:
            raise _Stop()
        state['count'] += 1
        if state['count'] > max_steps:
            state['stopping'] = 'steps'
        elif (time.monotonic() - started) * 1000 > max_ms:
            state['stopping'] = 'time'
        if state['stopping']:
            raise _Stop()

    def noise(frame):
        c = frame.f_code
        if c.co_filename != '<snippet>':
            return True
        if c.co_name == '<module>':
            return False
        return c.co_name.startswith('<') or not (c.co_flags & CO_OPTIMIZED)

    def local(frame, event, arg):
        f = fid(frame)
        if event == 'line':
            close(frame)
            text = lines[frame.f_lineno - 1].strip() if 0 < frame.f_lineno <= len(lines) else ''
            if not text or text.startswith(DEF_LINE) or text.startswith('#'):
                return local
            inputs = module_inputs.pop(f, None)
            if inputs:
                budget()
                steps.append({'line': frame.f_lineno, 'frame': f, 'kind': 'call', 'result': '', 'updates': inputs})
            budget()
            steps.append({'line': frame.f_lineno, 'frame': f, 'kind': 'line', 'result': '', 'updates': []})
            open_step[f] = len(steps) - 1
            last_step[f] = len(steps) - 1
        elif event == 'return':
            close(frame)
            i = last_step.get(f)
            if i is not None and lines[steps[i]['line'] - 1].strip().startswith('return'):
                steps[i]['result'] = _short(arg)
            snaps.pop(f, None)
        return local

    def global_trace(frame, event, arg):
        if event != 'call' or noise(frame):
            return None
        f = fid(frame)
        args = frame_vars(frame)
        snaps[f] = args
        updates = [[n, s[0], s[1]] for n, s in args.items()]
        if frame.f_code.co_name == '<module>':
            # Loose code's inputs (from the setup) show on its first real line; a highlight that
            # only defines a function or class never gets this step.
            module_inputs[f] = updates
        elif updates:
            budget()
            steps.append({'line': frame.f_code.co_firstlineno, 'frame': f, 'kind': 'call', 'result': '', 'updates': updates})
        return local

    sys.settrace(global_trace)
    try:
        with contextlib.redirect_stdout(buf):
            exec(snippet, g)
            if call.strip():
                try:
                    expr = compile(call, '<call>', 'eval')
                except SyntaxError:
                    expr = None
                if expr is not None:
                    out['value'] = _short(eval(expr, g))
                else:
                    exec(compile(call, '<call>', 'exec'), g)
    except _Stop:
        out['stopped'] = state['stopping']
    except BaseException as e:
        out['error'] = _err(e)
        tb = e.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == '<snippet>':
                out['errorInSnippet'] = True
            tb = tb.tb_next
    finally:
        sys.settrace(None)
    out['stdout'] = buf.getvalue()[-400:]
    return json.dumps(out)

def run_code(source, max_ms):
    # For the model test set: run a solution plus its tests, return what it printed or the error.
    g = {'__name__': '__main__'}
    exec(PRELUDE, g)
    buf = io.StringIO()
    started = time.monotonic()
    def guard(frame, event, arg):
        if (time.monotonic() - started) * 1000 > max_ms:
            raise _Stop()
        return None
    sys.settrace(guard)
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(source, '<solution>', 'exec'), g)
        return json.dumps({'ok': True, 'stdout': buf.getvalue()[-4000:]})
    except _Stop:
        return json.dumps({'ok': False, 'stdout': buf.getvalue()[-4000:], 'error': 'timed out'})
    except BaseException as e:
        return json.dumps({'ok': False, 'stdout': buf.getvalue()[-4000:], 'error': _err(e)})
    finally:
        sys.settrace(None)
`
