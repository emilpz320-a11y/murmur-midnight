# Murmur

Anonymous, verified feedback for teams, built on [Midnight](https://midnight.network).

Only enrolled members can post, and nobody, not even the admin, can tell which member wrote a report. Each member can post once per round, endorse each report once, and follow up on their own reports. The admin acknowledges and resolves reports in public.

Work in progress for the Midnight Buildathon (Wave 3). See `contract/murmur.compact`.

## Build

The Compact compiler runs in CI (`.github/workflows/compile.yml`), which commits the compiler output to `contract/managed/` and the logs to `compile.log` and `test.log`. Locally:

```sh
npm install
npm run compile        # needs the Compact toolchain (macOS/Linux)
npm test               # runs the contract in the in-memory simulator
```

## License

Apache-2.0
