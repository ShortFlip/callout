# Punch list

## Parked — 2026-09-26 (brainstorm: unpicked)
- **Night Recap to Discord.** At End Night, post who won each round plus the night's hottest, coldest and never-hit squares to the group's Discord channel; builds on the Discord win idea in `docs/ideas.md`. M. Connects `computeHeat` (#38) × the Discord call they play on.
- **Auto-close abandoned nights.** The daily keepalive Cron marks rounds stuck "active" for 12h+ as won or cancelled, so History, the leaderboard and heat stay clean (5 of 10 rounds are stuck today). S. Connects the Worker Cron Trigger × the rounds nobody ended.
- **Heat-targeted Mix.** Set a target Card Heat (e.g. about 40%) and the draw blends hot and cold items to hit it, aimed at "one bingo, then 75% of the second". M. Connects Card Heat × the Mix slider. Wait for more nights of data first.
- **Gold desk lights on bingo.** Home Assistant flashes the desk lights when someone wins. M. Connects the winner's tab × the HA desk scene. Needs a reachable HA webhook: an https site calling a local http HA gets blocked as mixed content.
- **Stream Deck Plus host controls.** New Round and Swap on Stream Deck keys. L. Connects host controls × Stream Deck Plus. Blocked on having no server endpoint for host actions; adding one breaks "no server in the game loop".

## Parked — 2026-10-02
- **Keep This Style.** Save the host's mid-game Style pick back to the card, so the next night starts in it. S. Parked until the night-only switch (#46) has been used on a real game night.
