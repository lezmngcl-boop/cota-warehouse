# Part 5: Working through lost connectivity

**Lost work: save on the device first.** The app shell is cached so it opens without a connection. Every action (a confirmed pick, a refill, a count correction) is written to a local queue on the phone first, then sent in order when the connection returns.

**Duplicate changes: one ID per action.** Each action gets a unique ID when it is created on the device. The server records every ID it has applied and ignores repeats. A retry or double tap changes stock once, not twice. Actions are sent as changes ("picked 3 cases from A1-R2-S1"), never as overwritten totals ("A1-R2-S1 = 15"), so two devices cannot overwrite each other's work.

**Conflicts: the server decides, a person resolves.** The server applies each change in a transaction and checks it still makes sense. If stock moved while the device was offline and the pick is no longer possible, the action is rejected with the reason. It goes to a "needs attention" list, never merged silently.

**Confusing results: always show the state.**
- An Offline banner while disconnected.
- "3 changes waiting to sync", then "all changes saved".
- Stock figures labelled "as of 10:42 AM" when they come from the device's copy.
- Pending actions visibly marked until the server confirms them.

Every applied change is logged with who, when, which device and the action ID, so any mismatch can be traced.
