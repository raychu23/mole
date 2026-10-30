# Design review: sidebar panel sections

- looked at how the 8 sections degrade independently
- AGREED: `buildPanelModel()` should keep running the other 7 sections when one Runner call throws, never fail the whole panel.
- someone mentioned the color scheme looks dated (not a decision, just a comment)
