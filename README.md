
# Tazzy Facebook & ABN Scraper

## Overview
This Node.js project automates the process of reading names from a Google Sheet, searching Facebook for profiles and company pages, scraping relevant information, extracting structured data with Claude, and writing results back to the Google Sheet. It also performs ABN/ABR lookups for Australian companies.

## Features
- Reads names from a Google Sheet (column B, rows 3–142)
- Automates Facebook login, search, and scraping (profile and company page)
- Extracts structured info using Claude (Anthropic)
- Looks up ABN, entity type, and location from abr.business.gov.au
- Writes all results to mapped columns in the same Google Sheet

## Setup Instructions

### 1. Clone the Repository
```sh
git clone <your-repo-url>
cd TAZZY
```

### 2. Install Dependencies
```sh
npm install
```

### 3. Configure Environment Variables
Copy the example file and fill in your credentials:
```sh
cp .env.example .env
```
Edit `.env` and set:
- `GOOGLE_SHEETS_ID` — Your Google Sheet ID
- `FB_EMAIL` — Facebook login email
- `FB_PASSWORD` — Facebook login password
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Google service account JSON (as a single line)
- `ANTHROPIC_API_KEY` — Claude API key
- `ABN_API_KEY` — (if required)

**Do not commit your real .env file!**

### 4. Google Sheets API Setup
- Create a Google Cloud project and enable the Google Sheets API.
- Download your `credentials.json` and place it in the project root (if required by your sheetsClient.js logic).
- Share your Google Sheet with the service account email.

### 5. Run the Script
```sh
node index.js
```

The script will process all names from row 3 to 142 and write results to the mapped columns.

## Notes
- No credentials or secrets are included in this repo.
- All sensitive config is handled via `.env` (see `.env.example`).
- For handoff, provide your client with this README and the `.env.example` file.

## Support
For issues or questions, contact the original developer or open a GitHub issue.
