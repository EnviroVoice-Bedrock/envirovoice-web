# envirovoice-web

EnviroVoice Web MVP for signaling-first voice platform development.

## Current Scope

Implemented now:

- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript + Express
- Signaling: WebSocket server (no audio transport)
- Health check API
- Basic room lifecycle (create, list, join, leave)
- Shared room state for multi-tab testing

Not implemented yet:

- WebRTC peer media/audio
- TURN/SFU
- Native desktop or Android capabilities

## Project Structure

- Frontend in repository root
- Backend in [backend](backend)

Main folders:

- [src](src)
- [backend/src](backend/src)

## Environment

Copy and adjust examples if needed:

- Frontend env: [.env.example](.env.example)
- Backend env: [backend/.env.example](backend/.env.example)

Defaults:

- Frontend: http://localhost:5173
- Backend/API: http://localhost:3000
- WebSocket signaling: ws://localhost:3000

## Run

Install everything (frontend + backend workspace dependencies):

```bash
npm install
```

Start frontend and backend together:

```bash
npm run dev
```

## API

Health check:

```http
GET /api/health
```

Response:

```json
{
	"success": true,
	"data": {
		"service": "envirovoice",
		"status": "online"
	}
}
```

Rooms:

- `GET /api/rooms`
- `POST /api/rooms`
- `POST /api/rooms/:roomId/join`
- `POST /api/rooms/:roomId/leave`

## Manual Test (2 tabs)

1. Open `http://localhost:5173` in tab A and tab B.
2. Login with different names.
3. Create a room in tab A.
4. Refresh room list in tab B and join.
5. Verify both users appear in the room participant list.
6. Toggle self mute and see room state updates.
7. Leave from one tab and verify participant list updates in the other.

## Build Validation

```bash
npm run build
```

This builds frontend and backend TypeScript outputs.
