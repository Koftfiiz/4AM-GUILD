# 4AM GUILD Reward Discord Interactions

This Edge Function receives Discord Interactions for the post-war reward registration system.

## Required Supabase Edge Function secrets

- `DISCORD_APPLICATION_PUBLIC_KEY`: Public Key from Discord Developer Portal → General Information.
- `DISCORD_GUILD_ID`: 4AM Discord server ID (`1482056434572198139`).

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. If your project does not expose them automatically, add them as Edge Function secrets.

## Deploy

Create an Edge Function named `reward-discord-interactions` and use the source in this folder. Set the Discord Developer Portal → General Information → Interactions Endpoint URL to `https://qbjixpcbzklrkcneluej.supabase.co/functions/v1/reward-discord-interactions`. Disable JWT verification for this function because Discord sends signed interaction requests, not Supabase user JWTs. The function verifies Discord's Ed25519 signature itself.

## Register the guild slash command

After deploying, register this command using the Discord application ID and bot token from your existing 4AM bot. Replace the two placeholders locally; do not commit the token.

```bash
curl -X PUT "https://discord.com/api/v10/applications/APP_ID/guilds/1482056434572198139/commands" \
  -H "Authorization: Bot BOT_TOKEN" \
  -H "Content-Type: application/json" \
  --data '[{
    "name":"reward-open",
    "description":"เปิดกิจกรรมลงชื่อรับรางวัลหลัง Guild War",
    "type":1,
    "options":[
      {
        "type":3,
        "name":"title",
        "description":"ชื่อกิจกรรมแจกของรางวัล",
        "required":true
      },
      {
        "type":3,
        "name":"signup_closes_at",
        "description":"เวลาปิดรับสมัครแบบ ISO 8601 เช่น 2026-11-12T21:00:00+07:00",
        "required":true
      }
    ]
  }]'
```

The command links the event to the latest published Guild War. Members can register or cancel using the buttons in the Discord message. The database RPC validates that the Discord account is linked to an active guild member who appears in that war's signup roster.
