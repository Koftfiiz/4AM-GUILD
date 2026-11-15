# 4AM GUILD War Attendance Check-in

Discord Interactions endpoint for round-specific War check-in.

## Required Edge Function secrets
- `DISCORD_APPLICATION_PUBLIC_KEY` — Discord Developer Portal → General Information → Public Key.
- `DISCORD_GUILD_ID` — 4AM Discord server ID: `1482056434572198139`.
- Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions.

Deploy as `war-attendance-checkin`, disable Supabase JWT verification (Discord requests are verified using Ed25519 signatures in this function), and set the Discord Interactions Endpoint URL to:

`https://qbjixpcbzklrkcneluej.supabase.co/functions/v1/war-attendance-checkin`

Run SQL `4AM_GUILD_WAR_ATTENDANCE_CENTER_V2` before deployment.

## Register the command
Register this guild command with the existing 4AM bot application. Keep the bot token local; never commit it.

```json
{
  "name": "war-checkin",
  "description": "เปิดระบบเช็กชื่อ Guild War แยกตามรอบ",
  "type": 1,
  "options": [
    {
      "type": 3,
      "name": "event_id",
      "description": "UUID ของกิจกรรมวอร์ที่ Publish แล้ว",
      "required": true
    }
  ]
}
```

The bot posts one persistent message with separate Round 01 and Round 02 buttons. It lists the current published party roster, shows confirmed and not-yet-confirmed members, validates the Discord account link, and updates the same message when a member checks in. It does not change party assignments or automatically call reserves.

## Important behavior
- Check-in is separate for each round.
- Only members assigned to a party for that event can check in.
- The management roster remains authoritative.
- Discord check-in does not prove in-game party presence.
- Management must verify the actual in-game roster and replace absent members in-game before 19:50.
