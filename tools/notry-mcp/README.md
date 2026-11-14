# notry-mcp

MCP server for filling in the lots the editor auto-detects on a plano. The editor stores each
detected polygon as a draft on notry-back; this server lets an assistant (Claude Code) read
those drafts next to the loteo's real lots and turn them into lots with names, prices and sizes
that follow the rest of the plano.

Node, `@modelcontextprotocol/sdk` over stdio, and the notry-back REST API. No database access
of its own: everything goes through the same endpoints and permissions as the apps.

## Tools

- `list_loteos`: loteos the account can see.
- `list_pending_lots`: drafts of a loteo, with centroid, bbox and plano area, in reading order.
- `get_loteo_context`: real lots with their data and position, plus m² per plano unit, USD/m², manzanas and naming.
- `get_draft_neighbors`: the closest real lots to one draft.
- `create_lots_from_drafts`: creates up to 50 lots from drafts; it can't touch existing lots.
- `discard_drafts`: deletes drafts that aren't lots (streets, green spaces).

## Running it

```bash
cd tools/notry-mcp && npm install
claude mcp add notry -s local \
  -e NOTRY_EMAIL=... -e NOTRY_PASSWORD=... \
  -e NOTRY_API_BASE=http://localhost:8000/api/v1 \
  -- node "$PWD/src/server.js"
```

`NOTRY_API_BASE` defaults to the local back. `NOTRY_ORG_ID` is only needed for super_admin accounts.
Use a test account: whatever the tools write lands in the shared database.

`npm test` runs the geometry tests.
