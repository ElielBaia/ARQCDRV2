# ARQCdR // Google Edition

Brazilian residential focus (NBR 15575), running on **Google Gemini**.

## Semantic Engine Stack
| Layer | Technology |
| :--- | :--- |
| **AI** | Google Gemini (gemini-1.5-flash) |
| **Backend** | Node.js (Express) + TypeScript |
| **Frontend** | React + Three.js + Tailwind CSS |
| **Persistence** | In-Memory (Server-side) |

## Quick Start
1. Create a `.env.local` file:
   ```env
   GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
   PORT=3000
   ```
2. Install & Run:
   ```bash
   npm install
   npm run dev
   ```

## Key Features
- **Dynamic Wall Height**: Automatically calculates ceiling height based on floor elevations.
- **BIM Generativo**: Translates architectural briefing to topological PBIM models.
- **AI Architect Critic**: Real-time spatial validation via Gemini.
