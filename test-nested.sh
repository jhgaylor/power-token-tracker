#!/usr/bin/env bash
# Load the extension in a throwaway headless GNOME Shell and report its state.
#
# Useful on Wayland, where the running shell caches extension modules and cannot
# re-import them -- a normal check otherwise needs a full log out / log in.
set -uo pipefail

UUID="power-token-tracker@jhgaylor.local"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

timeout 90 dbus-run-session -- bash -c '
  gnome-shell --headless --virtual-monitor 1280x720 >"'"$WORKDIR"'/shell.log" 2>&1 &
  SHELL_PID=$!

  for _ in $(seq 1 30); do
    sleep 1
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
      --method org.gnome.Shell.Extensions.ListExtensions >/dev/null 2>&1 && break
  done

  {
    gnome-extensions enable "'"$UUID"'"
    sleep 6
    gnome-extensions info "'"$UUID"'" | grep -E "State|Enabled"
    echo "--- errors ---"
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
      --method org.gnome.Shell.Extensions.GetExtensionErrors "'"$UUID"'"
  } >"'"$WORKDIR"'/result.txt" 2>&1

  kill $SHELL_PID 2>/dev/null
' >/dev/null 2>&1

cat "$WORKDIR/result.txt"

if grep -q "State: ACTIVE" "$WORKDIR/result.txt" && grep -q "(@as \[\],)" "$WORKDIR/result.txt"; then
  echo "PASS: extension loaded with no errors"
  exit 0
fi

echo "FAIL: extension did not load cleanly"
grep -iE 'power.?token|PowerToken|error' "$WORKDIR/shell.log" | head -20
exit 1
