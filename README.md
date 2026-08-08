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

## Deploy (Vercel)

This repository can be deployed to Vercel as a frontend app.

Important:

- Vercel is used here for the React web frontend.
- The backend WebSocket signaling server should be deployed separately (Render, Railway, Fly.io, etc.).
- Then set frontend environment variables in Vercel to point to that backend.

### 1. Deploy backend first (recommended)

Deploy [backend](backend) to a host that supports long-lived WebSocket connections.

Expected endpoints after deploy:

- API: `https://your-backend-domain`
- WebSocket: `wss://your-backend-domain`

### 2. Deploy frontend to Vercel

This repo includes [vercel.json](vercel.json) configured for Vite frontend output:

- buildCommand: `npm run build:frontend`
- outputDirectory: `dist`

### 3. Set environment variables in Vercel project

- `VITE_API_URL` = `https://your-backend-domain`
- `VITE_SIGNALING_URL` = `wss://your-backend-domain`

### 4. CLI deploy (optional)

1. `npm i -g vercel`
2. `vercel login`
3. From project root: `vercel`
4. Production deploy: `vercel --prod`

### 5. Quick post-deploy checks

1. Open frontend URL from Vercel.
2. Login with a test gamertag.
3. Verify room join/create works.
4. Open a second browser/tab and verify both users appear.
5. Verify microphone permission prompt and WebRTC voice flow.
