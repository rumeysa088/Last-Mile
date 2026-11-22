# DEPLOYMENT — Last Mile
Frontend (Local): http://localhost:5173

Backend (Local): http://localhost:8000
Status: **draft** — some sections depend on A (backend) and C (frontend scaffold) landing first.

> Prototype only. Not an official government service. All data is synthetic.

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | >= 20 | `node -v` |
| npm | >= 10 | `npm -v` |
| Python | >= 3.11 | `python --version` |
| Docker + Compose | current | `docker --version` |
| Tesseract OCR | >= 5 | `tesseract --version` |

## 2. Local development

### 2.1 Clone and env

```powershell
git clone <repo-url> last-mile
cd last-mile
Copy-Item .env.example .env