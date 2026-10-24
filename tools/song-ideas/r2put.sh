#!/bin/sh
# upload files to the metro-media R2 bucket, served at https://media.whoisthemetro.com/<key>
#   tools/song-ideas/r2put.sh <local file> <key> [content-type]
# the token lives in ~/.config/metro/cloudflare.env (never the repo). R2's object API takes up to
# 300 MB a file — the stems FLACs are ~40-80 MB.
set -e
. "$HOME/.config/metro/cloudflare.env"
curl -sf -X PUT -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: ${3:-application/octet-stream}" \
  --data-binary @"$1" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets/metro-media/objects/$2" >/dev/null
echo "up $2 ($(($(stat -f%z "$1")/1048576)) MB)"
