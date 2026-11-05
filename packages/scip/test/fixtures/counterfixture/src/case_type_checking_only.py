from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.pkg.leaf import Thing

def use_only(t: "Thing") -> int:
    return 0
