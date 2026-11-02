# adr-tools `adr new`

- Fetched: 2026-11-02
- URL: https://github.com/npryce/adr-tools/blob/master/src/adr-new
- Primary source: upstream command implementation.
- Relevant behavior: `-s` writes a forward supersession link, changes the old
  record's status, and writes the reciprocal link; `-l` writes both directions.
- T51 fit: borrow the reciprocal-record contract, but not automatic numbering,
  filename reference resolution, editor launching, or its non-transactional
  write sequence. Mole ids stay literal and explicit.
