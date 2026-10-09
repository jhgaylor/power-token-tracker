# Power & Token Tracker

A GNOME Shell extension that shows live GPU power draw in the panel and works out
what your AI tokens actually cost to generate.

The panel button shows current GPU watts. Opening it shows current and average
power, tokens generated in the last hour, your energy cost per hour, and the
resulting cost per million tokens.

## Requirements

- GNOME Shell 45 or later (developed against 50)
- A GPU exposing power via hwmon (`amdgpu`, `nvidia`, `i915` or `xe`)
- A [hal0](https://github.com/jhgaylor/hal0) instance for token metrics

## Install

```sh
make install
```

Then log out and back in — on Wayland the shell cannot load a new extension
without restarting the session — and enable it:

```sh
gnome-extensions enable power-token-tracker@jhgaylor.local
```

For development, `make link` symlinks this checkout into place instead of copying,
so edits only need a session restart rather than a reinstall.

## Configuration

```sh
gnome-extensions prefs power-token-tracker@jhgaylor.local
```

| Setting | Default | Meaning |
| --- | --- | --- |
| Start tracking on login | `on` | When off, the indicator starts paused |
| Cost per kWh | `0.12` | Your electricity rate, in dollars |
| Update interval | `10` | Seconds between refreshes |
| Show cost per token | `on` | Whether to compute cost per million tokens |
| hal0 API URL | `http://localhost:8080` | Base URL; `/api/stats` is appended |

## Pausing

The panel menu has a **Tracking** switch. Turning it off stops all polling — no
hwmon reads, no requests to hal0 — and the panel shows `⚡ off` until you turn it
back on. The pause lasts for the session; at the next login tracking starts
according to *Start tracking on login*. To remove the extension entirely, use
`gnome-extensions disable power-token-tracker@jhgaylor.local`.

## How it works

**Power** is read from `/sys/class/hwmon/hwmonN/power1_average` (falling back to
`power1_input`), in microwatts. The `hwmonN` index is not stable across boots, so
the extension locates the GPU by reading each `hwmonN/name` rather than hardcoding
an index. A rolling 360-sample window backs the average.

**Tokens** come from hal0's `/api/stats`, via `totals.tokens_completed`. That field
is a *rolling one hour window*, not a cumulative counter. Since it is already
per-hour, and energy cost is already per-hour, cost per million tokens is:

```
costPerHour = (avgWatts / 1000) * costPerKwh
costPerMillionTokens = costPerHour / tokensPerHour * 1_000_000
```

This is a measure of marginal generation cost — electricity to run the GPU. It does
not include hardware, idle draw outside the sample window, or anything upstream.

## Testing

The running shell caches extension modules and cannot re-import them, so a syntax
error normally costs you a log out / log in to discover. `make check` loads the
extension in a throwaway headless shell on a private D-Bus session and reports
whether it reached `ACTIVE` with no errors, without touching your live session.

## License

MIT
