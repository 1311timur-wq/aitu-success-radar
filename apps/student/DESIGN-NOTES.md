# Design notes

## Source of truth

- 17 unique screenshots (iPhone, 1179 x 2556 px at 3x, so a 393 x 852 pt layout) and a 49-second screen recording.
- The Radar mockup (1536 x 1024) is an AI-generated image with garbled text in places
  (e.g. "My couent ISuccess"). Its structure and numbers were used; its text was rebuilt cleanly.

## Tokens measured from the screenshots (dark theme)

| Token | Value | Used for |
|---|---|---|
| page | #3b3b3b | page background behind cards, menu and notification background |
| surface | #242424 | cards, header, tab bar, splash and login background |
| accent | #006fff | active tab, links, "Включить Face ID" button, search key |
| muted | #878d95 | dates, secondary labels |
| tile | #3d4756 | menu icon tiles (icon colour #cce4ff) |
| danger | #ff5252 | badge, Logout |
| tab-off | #9d9d9d | inactive tab |

- Font: system sans (SF on iOS). Card radius about 20 pt, story tiles 17 pt with a 3 pt white ring, pill buttons fully rounded.
- Header 56 pt content row with Dew head at the left, a hairline separator, and a bottom tab bar with three items.
- Light theme values are **assumed**: the references show only dark mode (theme "Авто" while the phone was in dark mode).

## Screens reproduced from the recording

Splash with loading bar, Dew welcome (blue gradient), login, the iOS "Wants to Use ... to Sign In" alert,
the Microsoft account picker and "Are you trying to sign in to My DU?" page, passcode creation and repeat,
Face ID offer, Home skeleton then content, notifications skeleton then list, Menu with search,
Peer Advisor skeleton, Profile (top and scrolled).

## Assumptions (not visible in the references)

- **Menu pages.** Dorm, Schedule, Applications and Peer Advisor show empty or skeleton states;
  Calendar shows a plain month grid; Documents shows the one document visible in Profile; the study plan lists the 4 courses from the mockup.
  All are marked "Демо-данные".
- **Peer Advisor** stays on a loading skeleton in the original recording; kept that way (about 1 s here, then an empty state).
- **Light theme** and **English strings** are new. Stories keep Russian captions because the text is part of the cropped image.
- **Radar numbers** are the mockup's fixed values; there is no calculation.
- **Passcode and Face ID** are visual only; any 4-digit code works and nothing is stored.
- **Artwork** is cropped from the screenshots, so it is limited to their resolution (the story tiles are about 260 px square).
- **Status bar and notch** are drawn only in the desktop phone frame; on a real phone the real one is used.
