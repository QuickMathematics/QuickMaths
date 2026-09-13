"""QuickMaths formal-verification engine.

The package keeps candidate search outside the trusted boundary. `verify_request`
checks submitted proof structure and generates a deterministic Lean artifact;
`prove_goal` may synthesize a bounded candidate proof, but only Lean can turn
that candidate into a `verified` result.
"""

from .contract import ContractError, canonical_hash, normalize_request
from .preview import request_preview
from .search import search_proof
from .state import inspect_request
from .verifier import VerificationResult, prove_goal, replay_certificate, verify_request

__all__ = [
    "ContractError",
    "VerificationResult",
    "canonical_hash",
    "normalize_request",
    "request_preview",
    "search_proof",
    "inspect_request",
    "verify_request",
    "prove_goal",
    "replay_certificate",
]
