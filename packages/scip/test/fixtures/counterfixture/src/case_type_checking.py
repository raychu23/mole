from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.pkg.leaf import Thing

from src.pkg.leaf import helper

def use(t: "Thing") -> int:
    return helper()
