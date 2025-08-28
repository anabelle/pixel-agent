#!/usr/bin/env bash
# Verify NOSTR-related environment variables for Pixel Agent
# Usage: ./verify-nostr-env.sh [path/to/.env]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env file not found at $ENV_FILE" >&2
  exit 2
fi

# Supported keys in plugin-nostr
SUPPORTED_KEYS=(
  NOSTR_PRIVATE_KEY
  NOSTR_RELAYS
  NOSTR_LISTEN_ENABLE
  NOSTR_POST_ENABLE
  NOSTR_POST_INTERVAL_MIN
  NOSTR_POST_INTERVAL_MAX
  NOSTR_REPLY_ENABLE
  NOSTR_REPLY_THROTTLE_SEC
  NOSTR_DISCOVERY_ENABLE
  NOSTR_DISCOVERY_INTERVAL_MIN
  NOSTR_DISCOVERY_INTERVAL_MAX
  NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN
  NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN
)

# Known/allowed but unused keys (warn only)
UNUSED_KEYS=(
  NOSTR_PUBLIC_KEY
  NOSTR_POST_IMMEDIATE_ON_START
)

is_in_array() {
  local needle="$1"; shift
  local elem
  for elem in "$@"; do
    [[ "$elem" == "$needle" ]] && return 0
  done
  return 1
}

strip_quotes() { sed -E "s/^['\"]?(.+?)['\"]?$/\1/"; }

# Read NOSTR_* lines (ignore commented)
mapfile -t LINES < <(grep -E '^[[:space:]]*NOSTR_[A-Z0-9_]+[[:space:]]*=' "$ENV_FILE" | sed -E 's/^[[:space:]]+//')

# Collect key/val maps in arrays
KEYS=()
VALS=()
for line in "${LINES[@]}"; do
  key="${line%%=*}"
  val="${line#*=}"
  val="$(echo "$val" | strip_quotes)"
  KEYS+=("$key")
  VALS+=("$val")
  if is_in_array "$key" "${SUPPORTED_KEYS[@]}"; then
    :
  elif is_in_array "$key" "${UNUSED_KEYS[@]}"; then
    echo "WARN: $key is present but not used by plugin; safe to remove (or keep if you use it elsewhere)."
  else
    echo "WARN: Unknown NOSTR_* var not used by plugin: $key"
  fi
done

# Value validators
errors=0
warns=0

get_val() {
  local target="$1"
  local i
  for i in "${!KEYS[@]}"; do
    if [[ "${KEYS[$i]}" == "$target" ]]; then
      echo "${VALS[$i]}"
      return 0
    fi
  done
  echo ""
}

require_bool() {
  local key="$1"; local val; val="$(get_val "$key")"
  [[ -z "$val" ]] && { echo "ERROR: $key is missing"; errors=$((errors+1)); return; }
  case "${val,,}" in
    true|false) : ;; 
    *) echo "ERROR: $key must be true/false (got '$val')"; errors=$((errors+1));;
  esac
}

require_num() {
  local key="$1"; local val; val="$(get_val "$key")"
  [[ -z "$val" ]] && { echo "ERROR: $key is missing"; errors=$((errors+1)); return; }
  if ! [[ "$val" =~ ^[0-9]+$ ]]; then
    echo "ERROR: $key must be an integer (seconds) (got '$val')"; errors=$((errors+1)); return
  fi
  if (( val < 0 )); then echo "ERROR: $key must be >= 0"; errors=$((errors+1)); fi
  if (( val % 1000 == 0 && val >= 1000 )); then
    echo "WARN: $key looks like milliseconds ($val); plugin will normalize to seconds ($((val/1000)))"; warns=$((warns+1))
  fi
}

check_min_max() {
  local minKey="$1"; local maxKey="$2"
  local min; min="$(get_val "$minKey")"
  local max; max="$(get_val "$maxKey")"
  if [[ -n "$min" && -n "$max" && "$min" =~ ^[0-9]+$ && "$max" =~ ^[0-9]+$ ]]; then
    if (( max < min )); then
      echo "ERROR: $maxKey ($max) must be >= $minKey ($min)"; errors=$((errors+1))
    fi
  fi
}

# Specific checks
# Keys
require_bool NOSTR_LISTEN_ENABLE
require_bool NOSTR_POST_ENABLE
require_bool NOSTR_REPLY_ENABLE
require_bool NOSTR_DISCOVERY_ENABLE

require_num NOSTR_POST_INTERVAL_MIN
require_num NOSTR_POST_INTERVAL_MAX
check_min_max NOSTR_POST_INTERVAL_MIN NOSTR_POST_INTERVAL_MAX

require_num NOSTR_REPLY_THROTTLE_SEC

require_num NOSTR_DISCOVERY_INTERVAL_MIN
require_num NOSTR_DISCOVERY_INTERVAL_MAX
check_min_max NOSTR_DISCOVERY_INTERVAL_MIN NOSTR_DISCOVERY_INTERVAL_MAX

require_num NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN
require_num NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN

# Relays
RELAYS="$(get_val NOSTR_RELAYS || true)"
if [[ -z "$RELAYS" ]]; then
  echo "ERROR: NOSTR_RELAYS is missing"; errors=$((errors+1))
else
  IFS=',' read -r -a relArr <<< "$RELAYS"
  for r in "${relArr[@]}"; do
    rTrim="${r//[[:space:]]/}"
    if [[ ! "$rTrim" =~ ^wss://[^[:space:]]+$ ]]; then
      echo "ERROR: Relay must be wss:// URL (got '$r')"; errors=$((errors+1))
    fi
  done
fi

# Private key
SK="$(get_val NOSTR_PRIVATE_KEY || true)"
if [[ -z "$SK" ]]; then
  echo "ERROR: NOSTR_PRIVATE_KEY is missing"; errors=$((errors+1))
else
  if [[ "$SK" =~ ^nsec1[0-9a-z]+$ ]]; then
    : # good
  elif [[ "$SK" =~ ^(0x)?[0-9a-fA-F]{64}$ ]]; then
    : # hex ok
  else
    echo "ERROR: NOSTR_PRIVATE_KEY must be nsec or 64-hex (got '$SK')"; errors=$((errors+1))
  fi
fi

# Summary
if (( errors > 0 )); then
  echo "\nValidation failed: $errors error(s), $warns warning(s)." >&2
  exit 1
fi

if (( warns > 0 )); then
  echo "\nValidation passed with $warns warning(s)."
else
  echo "\nValidation passed."
fi
