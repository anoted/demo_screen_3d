"""Select exactly two adjacent, equal portrait screens, excluding landscape desktops."""
def select_pair(screens):
    candidates = [i for i, s in enumerate(screens) if s.height > s.width]
    if len(candidates) != 2:
        raise ValueError('Expected exactly two portrait displays. Set the room panels to portrait in system display settings.')
    left, right = sorted(candidates, key=lambda i: screens[i].x)
    a, b = screens[left], screens[right]
    if a.y != b.y or a.width != b.width or a.height != b.height or a.x+a.width != b.x:
        raise ValueError('The two portrait displays must be adjacent, equally sized, and aligned at the top in system settings.')
    return left, right
