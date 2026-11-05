"""Docstring with an open ( paren that never closes."""
from . import decoy  # (unbalanced paren in a trailing comment, review round 3 HIGH-1
s = "string with ( paren"
from .. import leaf


def use():
    return leaf.helper(), decoy.DECOY, s
