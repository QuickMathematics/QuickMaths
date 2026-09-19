"""Trusted browser host for the unchanged protocol and certificate checks.
Kernel replies are private to one live RPC, never accepted from lesson data.
"""
import hashlib
import json
from types import SimpleNamespace
from . import verifier
from .protocol import handle_message

class PendingKernel(BaseException):
    def __init__(self, source, seconds):
        self.source, self.seconds = source, seconds

def browser_rpc(message_json, replies_json, *, project_dir="/tmp"):
    replies = json.loads(replies_json)
    def kernel(source, seconds):
        key = hashlib.sha256(source.encode()).hexdigest()
        if key not in replies:
            raise PendingKernel(source, seconds)
        reply = replies[key]
        return SimpleNamespace(returncode=reply['returncode'], stdout=reply['stdout'],
                               stderr=reply.get('stderr', ''), elapsed_ms=reply['elapsed_ms'])
    verifier._browser_kernel = kernel
    try:
        return json.dumps({'done': True, 'response': handle_message(json.loads(message_json), project_dir=project_dir)})
    except PendingKernel as pending:
        return json.dumps({'done': False, 'source': pending.source, 'seconds': pending.seconds})
    finally:
        verifier._browser_kernel = None
